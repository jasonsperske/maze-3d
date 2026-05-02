import { useMemo, type JSX } from "react";
import { type MazeCell } from "../utils/mazeGenerator";

interface CeilingLightsProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
  seed: number;
  lightSpacing: number;
  // When set, lights are placed only at these cell coordinates (key = "x,z").
  // Bypasses random placement.
  explicitLights?: Set<string>;
}

export function CeilingLights({
  maze,
  cellSize,
  wallHeight,
  seed,
  lightSpacing,
  explicitLights,
}: CeilingLightsProps) {
  const lights = useMemo(() => {
    const lightElements: JSX.Element[] = [];

    const renderLight = (x: number, z: number) => {
      const lightX = x * cellSize + cellSize / 2;
      const lightZ = z * cellSize + cellSize / 2;
      const lightY = wallHeight - 0.3;

      lightElements.push(
        <group key={`ceiling-light-${x}-${z}`}>
          <mesh position={[lightX, wallHeight - 0.1, lightZ]}>
            <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>

          <mesh position={[lightX, wallHeight - 0.25, lightZ]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial
              color="#fff3cd"
              emissive="#fff3cd"
              emissiveIntensity={0.3}
            />
          </mesh>

          <pointLight
            position={[lightX, lightY, lightZ]}
            intensity={2 + Math.sin(Date.now() * 0.01 + x * z) * 0.3}
            distance={cellSize * 3}
            decay={2}
            color="#fff3cd"
            castShadow={false}
          />
        </group>
      );
    };

    if (explicitLights) {
      for (const key of explicitLights) {
        const [xs, zs] = key.split(",");
        const x = Number(xs);
        const z = Number(zs);
        if (x >= 0 && x < maze.length && z >= 0 && z < maze[0].length) {
          renderLight(x, z);
        }
      }
    } else {
      const seededRandom = (seed: number): (() => number) => {
        let m_z = 987654321;
        let m_w = 123456789;
        const mask = 0xffffffff;

        m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
        m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;

        return function () {
          m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
          m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
          let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
          result /= 4294967296;
          return result;
        };
      };

      const random = seededRandom(seed);

      for (let x = 0; x < maze.length; x += lightSpacing + Math.floor(random() * 5)) {
        for (let z = 0; z < maze[0].length; z += lightSpacing + Math.floor(random() * 5)) {
          if (x >= maze.length || z >= maze[0].length) continue;

          const cell = maze[x][z];
          const wallCount = Object.values(cell.walls).filter(Boolean).length;
          if (wallCount >= 3) continue;

          renderLight(x, z);
        }
      }
    }

    return lightElements;
  }, [maze, cellSize, wallHeight, seed, lightSpacing, explicitLights]);

  return <>{lights}</>;
}
