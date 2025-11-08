import { useMemo, type JSX } from 'react';
import { type MazeCell } from '../utils/mazeGenerator';

interface Maze3DProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
  seed: number;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }) => void;
}

export function Maze3D({ maze, cellSize, wallHeight, seed }: Maze3DProps) {
  const walls = useMemo(() => {
    const wallElements: JSX.Element[] = [];
    
    // Simple seeded random for door placement
    const seededRandom = (seed: number): () => number => {
      let m_z = 987654321;
      let m_w = 123456789;
      const mask = 0xffffffff;
      
      m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
      m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;
      
      return function() {
        m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
        m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
        let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
        result /= 4294967296;
        return result;
      };
    };
    
    const random = seededRandom(seed); // Use maze seed for door placement
    
    maze.forEach((row, x) => {
      row.forEach((cell, z) => {
        const baseX = x * cellSize + cellSize / 2;
        const baseZ = z * cellSize + cellSize / 2;
        
        if (cell.walls.north) {
          const hasDoor = random() < 0.1; // 10% chance of door
          const wallY = wallHeight / 2;
          const wallZ = baseZ - cellSize / 2;
          
          if (hasDoor) {
            // Door frame (left side)
            wallElements.push(
              <mesh key={`wall-north-left-${x}-${z}`} position={[baseX - cellSize * 0.3, wallY, wallZ]}>
                <boxGeometry args={[cellSize * 0.4, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            // Door frame (right side)
            wallElements.push(
              <mesh key={`wall-north-right-${x}-${z}`} position={[baseX + cellSize * 0.3, wallY, wallZ]}>
                <boxGeometry args={[cellSize * 0.4, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            // Door frame (top)
            wallElements.push(
              <mesh key={`wall-north-top-${x}-${z}`} position={[baseX, wallY + wallHeight * 0.5, wallZ]}>
                <boxGeometry args={[cellSize * 0.2, wallHeight * 0.2, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            // Door itself
            wallElements.push(
              <mesh 
                key={`door-north-${x}-${z}`} 
                position={[baseX, wallHeight * 0.8, wallZ]}
                userData={{ isDoor: true, position: { x: baseX, y: wallY, z: wallZ } }}
              >
                <boxGeometry args={[cellSize * 0.2, wallHeight * 0.95, 0.15]} />
                <meshStandardMaterial color="#8B4513" />
              </mesh>
            );
          } else {
            wallElements.push(
              <mesh
                key={`wall-north-${x}-${z}`}
                position={[baseX, wallY, wallZ]}
              >
                <boxGeometry args={[cellSize, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
          }
        }
        
        if (cell.walls.south) {
          const hasDoor = random() < 0.1;
          const wallY = wallHeight / 2;
          const wallZ = baseZ + cellSize / 2;
          
          if (hasDoor) {
            wallElements.push(
              <mesh key={`wall-south-left-${x}-${z}`} position={[baseX - cellSize * 0.3, wallY, wallZ]}>
                <boxGeometry args={[cellSize * 0.4, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-south-right-${x}-${z}`} position={[baseX + cellSize * 0.3, wallY, wallZ]}>
                <boxGeometry args={[cellSize * 0.4, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-south-top-${x}-${z}`} position={[baseX, wallY + wallHeight * 0.25, wallZ]}>
                <boxGeometry args={[cellSize * 0.2, wallHeight * 0.5, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh 
                key={`door-south-${x}-${z}`} 
                position={[baseX, wallHeight * 0.475, wallZ]}
                userData={{ isDoor: true, position: { x: baseX, y: wallY, z: wallZ } }}
              >
                <boxGeometry args={[cellSize * 0.2, wallHeight * 0.95, 0.15]} />
                <meshStandardMaterial color="#8B4513" />
              </mesh>
            );
          } else {
            wallElements.push(
              <mesh key={`wall-south-${x}-${z}`} position={[baseX, wallY, wallZ]}>
                <boxGeometry args={[cellSize, wallHeight, 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
          }
        }
        
        if (cell.walls.east) {
          const hasDoor = random() < 0.1;
          const wallY = wallHeight / 2;
          const wallX = baseX + cellSize / 2;
          
          if (hasDoor) {
            wallElements.push(
              <mesh key={`wall-east-left-${x}-${z}`} position={[wallX, wallY, baseZ - cellSize * 0.3]}>
                <boxGeometry args={[0.2, wallHeight, cellSize * 0.4]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-east-right-${x}-${z}`} position={[wallX, wallY, baseZ + cellSize * 0.3]}>
                <boxGeometry args={[0.2, wallHeight, cellSize * 0.4]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-east-top-${x}-${z}`} position={[wallX, wallY + wallHeight * 0.25, baseZ]}>
                <boxGeometry args={[0.2, wallHeight * 0.5, cellSize * 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh 
                key={`door-east-${x}-${z}`} 
                position={[wallX, wallHeight * 0.475, baseZ]}
                userData={{ isDoor: true, position: { x: wallX, y: wallY, z: baseZ } }}
              >
                <boxGeometry args={[0.15, wallHeight * 0.95, cellSize * 0.2]} />
                <meshStandardMaterial color="#8B4513" />
              </mesh>
            );
          } else {
            wallElements.push(
              <mesh key={`wall-east-${x}-${z}`} position={[wallX, wallY, baseZ]}>
                <boxGeometry args={[0.2, wallHeight, cellSize]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
          }
        }
        
        if (cell.walls.west) {
          const hasDoor = random() < 0.1;
          const wallY = wallHeight / 2;
          const wallX = baseX - cellSize / 2;
          
          if (hasDoor) {
            wallElements.push(
              <mesh key={`wall-west-left-${x}-${z}`} position={[wallX, wallY, baseZ - cellSize * 0.3]}>
                <boxGeometry args={[0.2, wallHeight, cellSize * 0.4]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-west-right-${x}-${z}`} position={[wallX, wallY, baseZ + cellSize * 0.3]}>
                <boxGeometry args={[0.2, wallHeight, cellSize * 0.4]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh key={`wall-west-top-${x}-${z}`} position={[wallX, wallY + wallHeight * 0.25, baseZ]}>
                <boxGeometry args={[0.2, wallHeight * 0.5, cellSize * 0.2]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
            wallElements.push(
              <mesh 
                key={`door-west-${x}-${z}`} 
                position={[wallX, wallHeight * 0.475, baseZ]}
                userData={{ isDoor: true, position: { x: wallX, y: wallY, z: baseZ } }}
              >
                <boxGeometry args={[0.15, wallHeight * 0.95, cellSize * 0.2]} />
                <meshStandardMaterial color="#8B4513" />
              </mesh>
            );
          } else {
            wallElements.push(
              <mesh key={`wall-west-${x}-${z}`} position={[wallX, wallY, baseZ]}>
                <boxGeometry args={[0.2, wallHeight, cellSize]} />
                <meshStandardMaterial color="#666666" />
              </mesh>
            );
          }
        }
      });
    });
    
    return wallElements;
  }, [maze, cellSize, wallHeight, seed]);

  const floor = useMemo(() => {
    const mazeWidth = maze.length * cellSize;
    const mazeHeight = maze[0].length * cellSize;
    
    return (
      <mesh position={[mazeWidth / 2, -0.1, mazeHeight / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeHeight]} />
        <meshStandardMaterial color="#444444" />
      </mesh>
    );
  }, [maze, cellSize]);

  const ceiling = useMemo(() => {
    const mazeWidth = maze.length * cellSize;
    const mazeHeight = maze[0].length * cellSize;
    
    return (
      <mesh position={[mazeWidth / 2, wallHeight + 0.1, mazeHeight / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeHeight]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
    );
  }, [maze, cellSize, wallHeight]);

  return (
    <group>
      {walls}
      {floor}
      {ceiling}
    </group>
  );
}