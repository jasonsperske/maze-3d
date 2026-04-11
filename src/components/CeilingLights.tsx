import { useMemo, type JSX } from "react";
import type { LevelGeometry } from "../types/LevelGeometry";

interface CeilingLightsProps {
  level: LevelGeometry;
}

export function CeilingLights({ level }: CeilingLightsProps) {
  const lights = useMemo(() => {
    const lightElements: JSX.Element[] = [];
    const lightY = level.wallHeight - 0.3;

    for (const { x, z } of level.lightHints) {
      lightElements.push(
        <group key={`ceiling-light-${x}-${z}`}>
          <mesh position={[x, level.wallHeight - 0.1, z]}>
            <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>

          <mesh position={[x, level.wallHeight - 0.25, z]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial
              color="#fff3cd"
              emissive="#fff3cd"
              emissiveIntensity={0.3}
            />
          </mesh>

          <pointLight
            position={[x, lightY, z]}
            intensity={2 + Math.sin(Date.now() * 0.01 + x * z) * 0.3}
            distance={12}
            decay={2}
            color="#fff3cd"
            castShadow={false}
          />
        </group>
      );
    }

    return lightElements;
  }, [level]);

  return <>{lights}</>;
}
