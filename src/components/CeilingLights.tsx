import { useMemo, type JSX } from 'react';
import { type MazeCell } from '../utils/mazeGenerator';

interface CeilingLightsProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
}

export function CeilingLights({ maze, cellSize, wallHeight }: CeilingLightsProps) {
  const lights = useMemo(() => {
    const lightElements: JSX.Element[] = [];
    
    // Add lights sparsely - roughly every 8-12 cells
    for (let x = 0; x < maze.length; x += 8 + Math.floor(Math.random() * 5)) {
      for (let z = 0; z < maze[0].length; z += 8 + Math.floor(Math.random() * 5)) {
        // Skip if this position has walls (shouldn't happen in open areas but safety check)
        if (x >= maze.length || z >= maze[0].length) continue;
        
        const cell = maze[x][z];
        // Only place lights in areas that aren't completely walled in
        const wallCount = Object.values(cell.walls).filter(Boolean).length;
        if (wallCount >= 3) continue; // Skip very enclosed areas
        
        const lightX = x * cellSize + cellSize / 2;
        const lightZ = z * cellSize + cellSize / 2;
        const lightY = wallHeight - 0.3;
        
        // Dim, flickering point lights
        lightElements.push(
          <group key={`ceiling-light-${x}-${z}`}>
            {/* Light fixture model (simple hanging light) */}
            <mesh position={[lightX, wallHeight - 0.1, lightZ]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
              <meshStandardMaterial color="#333333" />
            </mesh>
            
            {/* Light bulb */}
            <mesh position={[lightX, wallHeight - 0.25, lightZ]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshStandardMaterial 
                color="#fff3cd" 
                emissive="#fff3cd" 
                emissiveIntensity={0.3}
              />
            </mesh>
            
            {/* Point light with flickering effect */}
            <pointLight
              position={[lightX, lightY, lightZ]}
              intensity={2 + Math.sin(Date.now() * 0.01 + x * z) * 0.3} // Subtle flicker
              distance={cellSize * 3}
              decay={2}
              color="#fff3cd" // Warm, slightly yellow light
              castShadow={false} // Disable shadows for performance
            />
          </group>
        );
      }
    }
    
    return lightElements;
  }, [maze, cellSize, wallHeight]);

  return <>{lights}</>;
}