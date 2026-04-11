import { MazeGenerator, type MazeCell } from '../utils/mazeGenerator';
import type { LevelGeometry, WallSegment } from '../types/LevelGeometry';
import type { LevelProvider, LevelProviderOptions } from './LevelProvider';

const CELL_SIZE = 4;

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

function gridToWallSegments(
  grid: MazeCell[][],
  wallHeight: number,
  seed: number,
  doorFrequency: number,
  halfHeightPartitions: boolean,
  halfHeightFrequency: number,
  halfHeightColor: string,
): WallSegment[] {
  const segments: WallSegment[] = [];
  const random = makeSeededRandom(seed);
  const halfRandom = makeSeededRandom(seed ^ 0xf00d);

  const addWall = (
    key: string,
    x1: number, z1: number,
    x2: number, z2: number,
    isNS: boolean,
  ) => {
    const hasDoor = random() < doorFrequency;
    const isHalf =
      !hasDoor &&
      halfHeightPartitions &&
      halfRandom() < halfHeightFrequency;

    if (hasDoor) {
      const midX = (x1 + x2) / 2;
      const midZ = (z1 + z2) / 2;
      // Door: two side-frame segments flanking a 40% gap in the center.
      // The gap is along the long axis of the wall.
      const gapFraction = 0.2; // each frame takes 20% on each end
      if (isNS) {
        const span = x2 - x1;
        segments.push({
          id: `${key}-left`,
          x1, z1,
          x2: x1 + span * gapFraction, z2: z1,
          height: wallHeight,
          isDoor: false,
        });
        segments.push({
          id: `${key}-right`,
          x1: x2 - span * gapFraction, z1,
          x2, z2,
          height: wallHeight,
          isDoor: false,
        });
      } else {
        const span = z2 - z1;
        segments.push({
          id: `${key}-left`,
          x1, z1,
          x2, z2: z1 + span * gapFraction,
          height: wallHeight,
          isDoor: false,
        });
        segments.push({
          id: `${key}-right`,
          x1, z1: z2 - span * gapFraction,
          x2, z2,
          height: wallHeight,
          isDoor: false,
        });
      }
      // The door panel itself (triggers portal)
      segments.push({
        id: key,
        x1: isNS ? (midX - (x2 - x1) * 0.1) : x1,
        z1: isNS ? z1 : (midZ - (z2 - z1) * 0.1),
        x2: isNS ? (midX + (x2 - x1) * 0.1) : x2,
        z2: isNS ? z2 : (midZ + (z2 - z1) * 0.1),
        height: wallHeight,
        isDoor: true,
      });
    } else {
      segments.push({
        id: key,
        x1, z1, x2, z2,
        height: isHalf ? wallHeight / 2 : wallHeight,
        halfHeight: isHalf,
        color: isHalf ? halfHeightColor : undefined,
      });
    }
  };

  grid.forEach((row, x) => {
    row.forEach((cell, z) => {
      const baseX = x * CELL_SIZE;
      const baseZ = z * CELL_SIZE;
      const far = CELL_SIZE;

      if (cell.walls.north) {
        addWall(`wall-north-${x}-${z}`, baseX, baseZ, baseX + far, baseZ, true);
      }
      if (cell.walls.south) {
        addWall(`wall-south-${x}-${z}`, baseX, baseZ + far, baseX + far, baseZ + far, true);
      }
      if (cell.walls.east) {
        addWall(`wall-east-${x}-${z}`, baseX + far, baseZ, baseX + far, baseZ + far, false);
      }
      if (cell.walls.west) {
        addWall(`wall-west-${x}-${z}`, baseX, baseZ, baseX, baseZ + far, false);
      }
    });
  });

  return segments;
}

function computeLightHints(
  grid: MazeCell[][],
  seed: number,
  lightSpacing: number,
): Array<{ x: number; z: number }> {
  const random = makeSeededRandom(seed);
  const hints: Array<{ x: number; z: number }> = [];

  for (let x = 0; x < grid.length; x += lightSpacing + Math.floor(random() * 5)) {
    for (let z = 0; z < grid[0].length; z += lightSpacing + Math.floor(random() * 5)) {
      if (x >= grid.length || z >= grid[0].length) continue;
      const wallCount = Object.values(grid[x][z].walls).filter(Boolean).length;
      if (wallCount >= 3) continue;
      hints.push({
        x: x * CELL_SIZE + CELL_SIZE / 2,
        z: z * CELL_SIZE + CELL_SIZE / 2,
      });
    }
  }
  return hints;
}

export const ThreeDMazeProvider: LevelProvider = {
  name: '3DMaze',

  generate({ seed, config }): LevelGeometry {
    const wallHeight = 3;
    const width = 25;
    const height = 25;

    const generator = new MazeGenerator(width, height, seed);
    const grid = generator.generate();

    if (config.widerRooms) {
      const random = makeSeededRandom(seed ^ 0xdead);
      grid.forEach((row, x) => {
        row.forEach((cell, z) => {
          if (cell.walls.south && z < grid[0].length - 1) {
            if (random() < config.widerRoomFrequency) {
              cell.walls.south = false;
              grid[x][z + 1].walls.north = false;
            }
          }
          if (cell.walls.east && x < grid.length - 1) {
            if (random() < config.widerRoomFrequency) {
              cell.walls.east = false;
              grid[x + 1][z].walls.west = false;
            }
          }
        });
      });
    }

    const walls = gridToWallSegments(
      grid, wallHeight, seed,
      config.doorFrequency,
      config.halfHeightPartitions, config.halfHeightFrequency, config.halfHeightColor,
    );

    const start = generator.getStartPosition();

    const lightHints = computeLightHints(grid, seed, config.lightSpacing);

    return {
      walls,
      playerStart: { x: start.x, y: 1.7, z: start.z },
      bounds: {
        minX: 0, minZ: 0,
        maxX: width * CELL_SIZE,
        maxZ: height * CELL_SIZE,
      },
      wallHeight,
      lightHints,
    };
  },
};
