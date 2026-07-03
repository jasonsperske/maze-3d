import { type MazeCell } from "./mazeGenerator";
import { type LightStyle } from "../types/LevelConfig";

// One light fixture in world space. `kind` selects the renderer; spotlight-shaped
// kinds carry a unit-ish direction vector pointing at where the cone should aim.
// Each kind gets its own union member so Extract<…, { kind }> narrows correctly.
type Vec3 = { x: number; y: number; z: number };
type Cell = { x: number; z: number };

export type LightFixture =
  | { kind: "ceiling-pendant"; cell: Cell; position: Vec3 }
  | { kind: "fluorescent";     cell: Cell; position: Vec3 }
  | { kind: "floor-lamp";      cell: Cell; position: Vec3; direction: Vec3 }
  | { kind: "corner-spot";     cell: Cell; position: Vec3; direction: Vec3 }
  | { kind: "wall-sconce";     cell: Cell; position: Vec3; direction: Vec3 }
  | { kind: "ceiling-sconce";  cell: Cell; position: Vec3 };

function makeSeededRandom(seed: number): () => number {
  const mask = 0xffffffff;
  let m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
  let m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;
  return () => {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    return (((m_z << 16) + (m_w & 65535)) >>> 0) / 4294967296;
  };
}

// Decide which cells host a light, then for "explorer" pick a fixture variant
// per cell (corner spotlight if the cell has a viable interior corner,
// otherwise a floor lantern). Returns positions in world units; CeilingLights
// renders them and MazeGame uses them for proximity to drive flashlight fade.
export function placeLights(
  maze: MazeCell[][],
  cellSize: number,
  wallHeight: number,
  seed: number,
  style: LightStyle,
  spacing: number,
  explicitCells?: Set<string>,
  // Exact stride grid: no jitter, no dead-end skipping — office regularity.
  regular = false
): LightFixture[] {
  const out: LightFixture[] = [];
  const random = makeSeededRandom(seed);

  const cells: Array<{ x: number; z: number }> = [];
  if (explicitCells) {
    for (const key of explicitCells) {
      const [xs, zs] = key.split(",");
      const x = Number(xs);
      const z = Number(zs);
      if (x >= 0 && x < maze.length && z >= 0 && z < maze[0].length) {
        cells.push({ x, z });
      }
    }
  } else if (style === "explorer") {
    // Sparse, irregular: probability per cell rather than stride. Skips fully
    // closed cells (4 walls) so we don't bury fixtures inside dead pockets.
    const prob = 1 / Math.max(spacing, 1);
    for (let x = 0; x < maze.length; x++) {
      for (let z = 0; z < maze[0].length; z++) {
        const wallCount = Object.values(maze[x][z].walls).filter(Boolean).length;
        if (wallCount >= 4) continue;
        if (random() < prob) cells.push({ x, z });
      }
    }
  } else {
    // ceiling-pendant / fluorescent / wall-sconce: deterministic stride scan.
    // Ceiling styles skip near-dead-end cells; sconces need a wall to mount on,
    // so they accept corridor cells and only skip fully sealed pockets.
    const jitter = () => (regular ? 0 : Math.floor(random() * 5));
    for (let x = 0; x < maze.length; x += spacing + jitter()) {
      for (let z = 0; z < maze[0].length; z += spacing + jitter()) {
        if (x >= maze.length || z >= maze[0].length) continue;
        const wallCount = Object.values(maze[x][z].walls).filter(Boolean).length;
        if (style === "wall-sconce") {
          if (wallCount === 0 || wallCount >= 4) continue;
        } else if (!regular && wallCount >= 3) {
          continue;
        }
        cells.push({ x, z });
      }
    }
  }

  // Map of corner offset → walls that must be present for the corner to exist.
  // Corners are inside angles where two perpendicular walls meet.
  const cornerCandidates: Array<{
    dx: -1 | 1;
    dz: -1 | 1;
    needs: ("north" | "south" | "east" | "west")[];
  }> = [
    { dx: -1, dz: -1, needs: ["north", "west"] },
    { dx:  1, dz: -1, needs: ["north", "east"] },
    { dx: -1, dz:  1, needs: ["south", "west"] },
    { dx:  1, dz:  1, needs: ["south", "east"] },
  ];

  for (const { x, z } of cells) {
    const cx = x * cellSize + cellSize / 2;
    const cz = z * cellSize + cellSize / 2;

    if (style === "ceiling-pendant" || style === "fluorescent") {
      out.push({
        kind: style,
        cell: { x, z },
        position: { x: cx, y: wallHeight - 0.3, z: cz },
      });
      continue;
    }

    if (style === "wall-sconce") {
      // Mount on a random present wall, high up, aimed into the room.
      const mounts = [
        { dir: "north" as const, nx: 0, nz: -1 },
        { dir: "south" as const, nx: 0, nz: 1 },
        { dir: "east" as const,  nx: 1, nz: 0 },
        { dir: "west" as const,  nx: -1, nz: 0 },
      ].filter((m) => maze[x][z].walls[m.dir]);
      // Some fixtures hang flush from the ceiling instead: occasionally for
      // variety, and always when the cell has no wall to mount on.
      const wantCeiling = random() < 0.25;
      if (mounts.length === 0 || wantCeiling) {
        out.push({
          kind: "ceiling-sconce",
          cell: { x, z },
          position: { x: cx, y: wallHeight - 0.16, z: cz },
        });
        continue;
      }
      const m = mounts[Math.floor(random() * mounts.length)];
      const inset = 0.28; // shade sits just off the wall face
      out.push({
        kind: "wall-sconce",
        cell: { x, z },
        position: {
          x: cx + m.nx * (cellSize / 2 - inset),
          y: wallHeight * 0.74,
          z: cz + m.nz * (cellSize / 2 - inset),
        },
        direction: { x: -m.nx, y: 0, z: -m.nz },
      });
      continue;
    }

    // explorer: pick floor-lamp or corner-spot
    const cell = maze[x][z];
    const validCorners = cornerCandidates.filter((c) =>
      c.needs.every((d) => cell.walls[d])
    );
    const pickCorner = validCorners.length > 0 && random() < 0.6;

    if (pickCorner) {
      const corner = validCorners[Math.floor(random() * validCorners.length)];
      const inset = 0.25;
      const cornerX = cx + corner.dx * (cellSize / 2 - inset);
      const cornerZ = cz + corner.dz * (cellSize / 2 - inset);
      const cornerY = wallHeight * 0.65;
      // Aim toward the room's interior, slightly downward so the cone lands on
      // the opposite wall rather than firing across the ceiling.
      const dirX = -corner.dx;
      const dirZ = -corner.dz;
      const len = Math.hypot(dirX, dirZ);
      out.push({
        kind: "corner-spot",
        cell: { x, z },
        position: { x: cornerX, y: cornerY, z: cornerZ },
        direction: {
          x: (dirX / len) * 0.8,
          y: -0.35,
          z: (dirZ / len) * 0.8,
        },
      });
    } else {
      // Floor lantern: jitter inside the cell so two adjacent cells don't form
      // a perfect line of dropped lights.
      const offsetX = (random() - 0.5) * (cellSize * 0.55);
      const offsetZ = (random() - 0.5) * (cellSize * 0.55);
      const tilt = random() * Math.PI * 2;
      out.push({
        kind: "floor-lamp",
        cell: { x, z },
        position: { x: cx + offsetX, y: 0.18, z: cz + offsetZ },
        direction: {
          x: Math.cos(tilt) * 0.25,
          y: 1,
          z: Math.sin(tilt) * 0.25,
        },
      });
    }
  }

  return out;
}
