import { type MazeCell } from "./mazeGenerator";
import { type LevelConfig } from "../types/LevelConfig";

// What a wall segment turned out to be. Decided once, here, from the same
// seeded streams Maze3D used to decide it inline — geometry and visibility
// have to agree about which walls you can see through or the culler will hide
// rooms you are looking straight at.
export type WallKind = "none" | "full" | "half" | "door";

export const NORTH = 0;
export const SOUTH = 1;
export const EAST = 2;
export const WEST = 3;
export type Direction = 0 | 1 | 2 | 3;

export const DIRECTION_NAMES = ["north", "south", "east", "west"] as const;
export const OPPOSITE: Direction[] = [SOUTH, NORTH, WEST, EAST];
// North is -Z: the north wall of cell (x, z) sits at the z*cellSize edge.
export const STEP_X = [0, 0, 1, -1];
export const STEP_Z = [-1, 1, 0, 0];

const KIND_CODES: WallKind[] = ["none", "full", "half", "door"];
const NONE = 0, FULL = 1, HALF = 2, DOOR = 3;

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

export class WallLayout {
  readonly width: number;
  readonly height: number;
  private readonly kinds: Uint8Array;   // [x * height + z] * 4 + direction
  private readonly opaque: Uint8Array;  // same indexing, 1 = blocks sight

  constructor(width: number, height: number, kinds: Uint8Array) {
    this.width = width;
    this.height = height;
    this.kinds = kinds;
    this.opaque = new Uint8Array(kinds.length);
    this.computeOpacity();
  }

  private idx(x: number, z: number, dir: Direction): number {
    return (x * this.height + z) * 4 + dir;
  }

  kind(x: number, z: number, dir: Direction): WallKind {
    return KIND_CODES[this.kinds[this.idx(x, z, dir)]];
  }

  /** True when sight is stopped here. Cheap enough to call in the flood fill. */
  blocksSight(x: number, z: number, dir: Direction): boolean {
    return this.opaque[this.idx(x, z, dir)] === 1;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.height;
  }

  // Every interior wall is built twice — once as this cell's north, once as the
  // neighbour's south — and the two copies draw their door and half-height
  // decisions from the stream independently, so they can disagree. Sight is
  // stopped if *either* copy stands full height.
  private computeOpacity() {
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.height; z++) {
        for (let d = 0 as Direction; d < 4; d++) {
          const k = this.kinds[this.idx(x, z, d)];
          if (k === NONE) continue;
          if (k !== HALF) { this.opaque[this.idx(x, z, d)] = 1; continue; }
          const nx = x + STEP_X[d], nz = z + STEP_Z[d];
          // A half wall on the outer boundary has nothing behind it to reveal.
          if (!this.inBounds(nx, nz)) { this.opaque[this.idx(x, z, d)] = 1; continue; }
          const twin = this.kinds[this.idx(nx, nz, OPPOSITE[d])];
          this.opaque[this.idx(x, z, d)] = twin === HALF ? 0 : 1;
        }
      }
    }
  }
}

// Walks the maze in exactly the order Maze3D's render loop walks it, drawing
// from the same two streams in the same places, so the kinds returned here are
// the walls that actually get built. The picture stream is seeded separately
// and stays in Maze3D; it never interleaves with these two.
export function computeWallLayout(
  maze: MazeCell[][],
  seed: number,
  config: LevelConfig,
  explicitDoors?: Map<string, string>
): WallLayout {
  const width = maze.length;
  const height = maze[0].length;
  const kinds = new Uint8Array(width * height * 4);
  const random = makeSeededRandom(seed);
  const halfRandom = makeSeededRandom(seed ^ 0xf00d);

  maze.forEach((row, x) => {
    row.forEach((cell, z) => {
      for (let d = 0 as Direction; d < 4; d++) {
        if (!cell.walls[DIRECTION_NAMES[d]]) continue;
        const hasDoor = explicitDoors
          ? explicitDoors.has(`${x},${z},${DIRECTION_NAMES[d]}`)
          : random() < config.doorFrequency;
        const isHalf =
          !hasDoor &&
          !explicitDoors &&
          config.halfHeightPartitions &&
          halfRandom() < config.halfHeightFrequency;
        kinds[(x * height + z) * 4 + d] = hasDoor ? DOOR : isHalf ? HALF : FULL;
      }
    });
  });

  return new WallLayout(width, height, kinds);
}
