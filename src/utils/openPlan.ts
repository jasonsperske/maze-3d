import { type MazeCell } from "./mazeGenerator";
import { type OpenPlanConfig } from "../types/LevelConfig";

// A freestanding column in world space, left where structure used to be.
// Rendered by Maze3D and collided with by FirstPersonController.
export interface Pillar {
  x: number;
  z: number;
  size: number;
}

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

// Open-plan pass: turns a corridor maze into liminal office space.
//   1. Carve rectangular clearings — the big empty rooms.
//   2. Randomly remove remaining interior walls — what survives reads as
//      freestanding partition segments you can walk around.
//   3. Drop columns at junctions with no walls left, as if the building
//      still needs holding up.
// Only ever removes walls, so maze connectivity is preserved. Mutates the
// grid in place and returns the pillar list.
export function applyOpenPlan(
  grid: MazeCell[][],
  seed: number,
  opts: OpenPlanConfig,
  cellSize: number
): Pillar[] {
  const random = makeSeededRandom(seed);
  const width = grid.length;
  const height = grid[0].length;

  const removeEast = (x: number, z: number) => {
    if (x >= width - 1) return;
    grid[x][z].walls.east = false;
    grid[x + 1][z].walls.west = false;
  };
  const removeSouth = (x: number, z: number) => {
    if (z >= height - 1) return;
    grid[x][z].walls.south = false;
    grid[x][z + 1].walls.north = false;
  };

  // 1. Clearings
  const [minR, maxR] = opts.clearingSize;
  for (let i = 0; i < opts.clearings; i++) {
    const cx = Math.floor(random() * width);
    const cz = Math.floor(random() * height);
    const rx = minR + Math.floor(random() * (maxR - minR + 1));
    const rz = minR + Math.floor(random() * (maxR - minR + 1));
    const x0 = Math.max(0, cx - rx);
    const x1 = Math.min(width - 1, cx + rx);
    const z0 = Math.max(0, cz - rz);
    const z1 = Math.min(height - 1, cz + rz);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x < x1) removeEast(x, z);
        if (z < z1) removeSouth(x, z);
      }
    }
  }

  // 2. Thin the surviving interior walls
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
      if (grid[x][z].walls.east && x < width - 1 && random() < opts.wallRemoval) {
        removeEast(x, z);
      }
      if (grid[x][z].walls.south && z < height - 1 && random() < opts.wallRemoval) {
        removeSouth(x, z);
      }
    }
  }

  // 3. Columns at fully open interior junctions
  const pillars: Pillar[] = [];
  const size = opts.pillarSize ?? 0.5;
  for (let jx = 1; jx < width; jx++) {
    for (let jz = 1; jz < height; jz++) {
      // The four wall segments that could meet at junction (jx, jz)
      const a = grid[jx - 1][jz - 1];
      const b = grid[jx][jz - 1];
      const c = grid[jx - 1][jz];
      const hasIncidentWall =
        a.walls.east || c.walls.east || a.walls.south || b.walls.south;
      const roll = random();
      if (!hasIncidentWall && roll < opts.pillarFrequency) {
        pillars.push({ x: jx * cellSize, z: jz * cellSize, size });
      }
    }
  }

  return pillars;
}
