import { useMemo, type JSX } from 'react';
import { type MazeCell } from '../utils/mazeGenerator';
import { type LevelConfig } from '../types/LevelConfig';

interface Maze3DProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
  seed: number;
  config: LevelConfig;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => void;
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

export function Maze3D({ maze, cellSize, wallHeight, seed, config }: Maze3DProps) {
  const walls = useMemo(() => {
    const elements: JSX.Element[] = [];
    const random = makeSeededRandom(seed);
    // Separate stream for half-height so door randomisation is unaffected
    const halfRandom = makeSeededRandom(seed ^ 0xf00d);

    // Helper: render one wall segment (door or plain, full or half-height).
    // pos: center position  dims: [w, h, d] of a full-height plain wall
    // isNS: true for north/south walls (door opening is along X), false for east/west (along Z)
    const renderWall = (
      key: string,
      px: number, pz: number,
      fullW: number, fullD: number,
      isNS: boolean
    ) => {
      const hasDoor = random() < config.doorFrequency;
      const isHalf =
        !hasDoor &&
        config.halfHeightPartitions &&
        halfRandom() < config.halfHeightFrequency;

      const h = isHalf ? wallHeight / 2 : wallHeight;
      const py = h / 2;
      const color = isHalf ? config.halfHeightColor : config.wallColor;

      if (hasDoor) {
        // Side frames (full height, flanking the opening)
        const frameW = isNS ? cellSize * 0.4 : 0.2;
        const frameD = isNS ? 0.2 : cellSize * 0.4;
        const frameOffset = cellSize * 0.3;

        const [lx, lz] = isNS
          ? [px - frameOffset, pz]
          : [px, pz - frameOffset];
        const [rx, rz] = isNS
          ? [px + frameOffset, pz]
          : [px, pz + frameOffset];

        elements.push(
          <mesh key={`${key}-left`} position={[lx, wallHeight / 2, lz]}>
            <boxGeometry args={[frameW, wallHeight, frameD]} />
            <meshStandardMaterial color={config.wallColor} />
          </mesh>
        );
        elements.push(
          <mesh key={`${key}-right`} position={[rx, wallHeight / 2, rz]}>
            <boxGeometry args={[frameW, wallHeight, frameD]} />
            <meshStandardMaterial color={config.wallColor} />
          </mesh>
        );

        // Top frame above the opening
        const topW = isNS ? cellSize * 0.2 : 0.2;
        const topD = isNS ? 0.2 : cellSize * 0.2;
        elements.push(
          <mesh key={`${key}-top`} position={[px, wallHeight * 0.9, pz]}>
            <boxGeometry args={[topW, wallHeight * 0.2, topD]} />
            <meshStandardMaterial color={config.wallColor} />
          </mesh>
        );

        // Door panel
        const doorW = isNS ? cellSize * 0.2 : 0.15;
        const doorD = isNS ? 0.15 : cellSize * 0.2;
        elements.push(
          <mesh
            key={`${key}-door`}
            position={[px, wallHeight * 0.4, pz]}
            userData={{ isDoor: true, position: { x: px, y: wallHeight / 2, z: pz } }}
          >
            <boxGeometry args={[doorW, wallHeight * 0.8, doorD]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        );
      } else {
        elements.push(
          <mesh key={key} position={[px, py, pz]}>
            <boxGeometry args={[fullW, h, fullD]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      }
    };

    maze.forEach((row, x) => {
      row.forEach((cell, z) => {
        const baseX = x * cellSize + cellSize / 2;
        const baseZ = z * cellSize + cellSize / 2;

        if (cell.walls.north) {
          renderWall(
            `wall-north-${x}-${z}`,
            baseX, baseZ - cellSize / 2,
            cellSize, 0.2,
            true
          );
        }
        if (cell.walls.south) {
          renderWall(
            `wall-south-${x}-${z}`,
            baseX, baseZ + cellSize / 2,
            cellSize, 0.2,
            true
          );
        }
        if (cell.walls.east) {
          renderWall(
            `wall-east-${x}-${z}`,
            baseX + cellSize / 2, baseZ,
            0.2, cellSize,
            false
          );
        }
        if (cell.walls.west) {
          renderWall(
            `wall-west-${x}-${z}`,
            baseX - cellSize / 2, baseZ,
            0.2, cellSize,
            false
          );
        }
      });
    });

    return elements;
  }, [maze, cellSize, wallHeight, seed, config]);

  const floor = useMemo(() => {
    const mazeWidth = maze.length * cellSize;
    const mazeDepth = maze[0].length * cellSize;
    return (
      <mesh position={[mazeWidth / 2, -0.1, mazeDepth / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
        <meshStandardMaterial color={config.floorColor} />
      </mesh>
    );
  }, [maze, cellSize, config.floorColor]);

  const ceiling = useMemo(() => {
    const mazeWidth = maze.length * cellSize;
    const mazeDepth = maze[0].length * cellSize;
    return (
      <mesh position={[mazeWidth / 2, wallHeight + 0.1, mazeDepth / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
        <meshStandardMaterial color={config.ceilingColor} />
      </mesh>
    );
  }, [maze, cellSize, wallHeight, config.ceilingColor]);

  return (
    <group>
      {walls}
      {floor}
      {ceiling}
    </group>
  );
}
