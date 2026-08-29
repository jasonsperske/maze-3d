import { WallLayout, type Direction, OPPOSITE, STEP_X, STEP_Z } from "./wallLayout";

// Which cells can be seen from a point, by flooding outward through the gaps
// between cells and narrowing a 2D wedge at each one.
//
// The maze is a grid extruded straight up — every occluder is vertical, the
// floor and ceiling are flat — so plane visibility is the whole answer here,
// no height term needed. Half-height partitions are openings: you see over
// them.
//
// The wedge is a pair of direction vectors (r, l) with cross(r, l) > 0, and a
// direction v lies inside it when cross(r, v) >= 0 and cross(v, l) >= 0. Two
// vectors rather than two angles so there is no wraparound case to get wrong.

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

export interface VisibilityStats {
  cellsVisible: number;   // cells the flood actually reached
  cellsDrawn: number;     // after dilation — what gets rendered
  expansions: number;
  bailed: boolean;        // budget blew, fell back to drawing everything in range
}

// Portal corners are the ideal cell edge, ignoring that the flanking walls are
// 0.2 thick and eat into the opening. That makes the wedge slightly too wide,
// which errs toward drawing a cell that is not quite visible — the safe way to
// be wrong.
const STACK_SLOTS = 7; // x, z, from, rx, rz, lx, lz

export class VisibilitySolver {
  private readonly layout: WallLayout;
  private readonly cellSize: number;
  private readonly w: number;
  private readonly h: number;
  /** 1 where the cell's geometry should be drawn. Reused between solves. */
  readonly drawn: Uint8Array;
  private readonly reached: Uint8Array;
  private readonly stack: Float64Array;
  // Widest wedge already pushed for a (cell, entry direction), so an open room
  // does not re-expand the same cell down every path that leads to it.
  private readonly memo: Float64Array;
  private readonly memoStamp: Int32Array;
  private stamp = 0;
  private readonly expansionBudget: number;

  constructor(layout: WallLayout, cellSize: number) {
    this.layout = layout;
    this.cellSize = cellSize;
    this.w = layout.width;
    this.h = layout.height;
    const cells = this.w * this.h;
    this.drawn = new Uint8Array(cells);
    this.reached = new Uint8Array(cells);
    this.stack = new Float64Array(cells * 4 * STACK_SLOTS);
    this.memo = new Float64Array(cells * 4 * 4);
    this.memoStamp = new Int32Array(cells * 4);
    this.expansionBudget = cells * 8;
  }

  private portal(
    x: number, z: number, dir: Direction, eyeX: number, eyeZ: number, out: Float64Array
  ): boolean {
    const C = this.cellSize;
    const x0 = x * C, x1 = x0 + C, z0 = z * C, z1 = z0 + C;
    let ax: number, az: number, bx: number, bz: number;
    if (dir === 0) { ax = x0; az = z0; bx = x1; bz = z0; }        // north
    else if (dir === 1) { ax = x0; az = z1; bx = x1; bz = z1; }   // south
    else if (dir === 2) { ax = x1; az = z0; bx = x1; bz = z1; }   // east
    else { ax = x0; az = z0; bx = x0; bz = z1; }                  // west
    const dax = ax - eyeX, daz = az - eyeZ;
    const dbx = bx - eyeX, dbz = bz - eyeZ;
    const c = cross(dax, daz, dbx, dbz);
    if (c === 0) return false; // eye on the portal's line — nothing to see through
    if (c > 0) { out[0] = dax; out[1] = daz; out[2] = dbx; out[3] = dbz; }
    else { out[0] = dbx; out[1] = dbz; out[2] = dax; out[3] = daz; }
    return true;
  }

  private scratch = new Float64Array(4);

  /**
   * Flood from a world-space eye point. Writes `drawn`; returns what happened.
   * `maxDistance` is world units from the eye to the nearest corner of a cell.
   */
  solve(eyeX: number, eyeZ: number, maxDistance: number): VisibilityStats {
    const { w, h, layout, cellSize: C } = this;
    this.drawn.fill(0);
    this.reached.fill(0);
    this.stamp++;
    const stamp = this.stamp;

    const ex = Math.min(w - 1, Math.max(0, Math.floor(eyeX / C)));
    const ez = Math.min(h - 1, Math.max(0, Math.floor(eyeZ / C)));
    this.reached[ex * h + ez] = 1;

    const stack = this.stack;
    const p = this.scratch;
    let sp = 0;
    let expansions = 0;
    let bailed = false;

    const inRange = (cx: number, cz: number): boolean => {
      const dx = Math.max(cx * C - eyeX, 0, eyeX - (cx + 1) * C);
      const dz = Math.max(cz * C - eyeZ, 0, eyeZ - (cz + 1) * C);
      return dx * dx + dz * dz <= maxDistance * maxDistance;
    };

    for (let d = 0 as Direction; d < 4; d++) {
      if (layout.blocksSight(ex, ez, d)) continue;
      const nx = ex + STEP_X[d], nz = ez + STEP_Z[d];
      if (!layout.inBounds(nx, nz) || !inRange(nx, nz)) continue;
      if (!this.portal(ex, ez, d, eyeX, eyeZ, p)) continue;
      const base = sp * STACK_SLOTS;
      stack[base] = nx; stack[base + 1] = nz; stack[base + 2] = d;
      stack[base + 3] = p[0]; stack[base + 4] = p[1];
      stack[base + 5] = p[2]; stack[base + 6] = p[3];
      sp++;
    }

    while (sp > 0) {
      if (++expansions > this.expansionBudget) { bailed = true; break; }
      sp--;
      const base = sp * STACK_SLOTS;
      const x = stack[base], z = stack[base + 1];
      const from = stack[base + 2] as Direction;
      const rx = stack[base + 3], rz = stack[base + 4];
      const lx = stack[base + 5], lz = stack[base + 6];
      this.reached[x * h + z] = 1;

      const back = OPPOSITE[from];
      for (let d = 0 as Direction; d < 4; d++) {
        if (d === back) continue;
        if (layout.blocksSight(x, z, d)) continue;
        const nx = x + STEP_X[d], nz = z + STEP_Z[d];
        if (!layout.inBounds(nx, nz) || !inRange(nx, nz)) continue;
        if (!this.portal(x, z, d, eyeX, eyeZ, p)) continue;

        // Narrow the wedge to the part of this portal still inside it.
        const nrIsPortal = cross(rx, rz, p[0], p[1]) > 0;
        const nrx = nrIsPortal ? p[0] : rx, nrz = nrIsPortal ? p[1] : rz;
        const nlIsPortal = cross(p[2], p[3], lx, lz) > 0;
        const nlx = nlIsPortal ? p[2] : lx, nlz = nlIsPortal ? p[3] : lz;
        if (cross(nrx, nrz, nlx, nlz) <= 0) continue; // nothing left of it

        const mi = (nx * h + nz) * 4 + d;
        if (this.memoStamp[mi] === stamp) {
          const m = mi * 4;
          const contained =
            cross(this.memo[m], this.memo[m + 1], nrx, nrz) >= 0 &&
            cross(nlx, nlz, this.memo[m + 2], this.memo[m + 3]) >= 0;
          if (contained) continue;
        }
        this.memoStamp[mi] = stamp;
        const m = mi * 4;
        this.memo[m] = nrx; this.memo[m + 1] = nrz;
        this.memo[m + 2] = nlx; this.memo[m + 3] = nlz;

        const nb = sp * STACK_SLOTS;
        if (nb + STACK_SLOTS > stack.length) { bailed = true; sp = 0; break; }
        stack[nb] = nx; stack[nb + 1] = nz; stack[nb + 2] = d;
        stack[nb + 3] = nrx; stack[nb + 4] = nrz;
        stack[nb + 5] = nlx; stack[nb + 6] = nlz;
        sp++;
      }
      if (bailed) break;
    }

    let cellsVisible = 0;
    if (bailed) {
      // Budget blown. Draw everything in range rather than risk a hole: the
      // frame gets slower, never wrong.
      for (let x = 0; x < w; x++) {
        for (let z = 0; z < h; z++) {
          if (inRange(x, z)) { this.reached[x * h + z] = 1; }
        }
      }
    }
    for (let i = 0; i < this.reached.length; i++) if (this.reached[i]) cellsVisible++;

    // Dilate by one cell before drawing. Interior walls are built twice, once
    // from each side, and the two copies roll their door and half-height
    // decisions separately — so a cell that is hidden can still own the only
    // full-height copy of a wall a visible cell shows as half. Drawing the ring
    // around what is visible closes those gaps for the cost of a few cells.
    let cellsDrawn = 0;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < h; z++) {
        let on = 0;
        for (let ox = -1; ox <= 1 && !on; ox++) {
          for (let oz = -1; oz <= 1; oz++) {
            const cx = x + ox, cz = z + oz;
            if (cx < 0 || cz < 0 || cx >= w || cz >= h) continue;
            if (this.reached[cx * h + cz]) { on = 1; break; }
          }
        }
        this.drawn[x * h + z] = on;
        cellsDrawn += on;
      }
    }

    return { cellsVisible, cellsDrawn, expansions, bailed };
  }
}

/**
 * How far sight is worth tracing. Exponential-squared fog is effectively opaque
 * once density * distance reaches 3 (about 0.01% transmittance), so there is
 * nothing to draw past that. Without fog, the whole maze stays in play.
 */
export function sightRange(
  fog: { density: number } | undefined,
  width: number,
  height: number,
  cellSize: number
): number {
  const diagonal = Math.hypot(width * cellSize, height * cellSize);
  if (!fog || fog.density <= 0) return diagonal;
  return Math.min(diagonal, 3 / fog.density);
}
