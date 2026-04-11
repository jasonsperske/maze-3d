import { useMemo, type JSX } from 'react';
import type { LevelGeometry, WallSegment } from '../types/LevelGeometry';
import type { LevelConfig } from '../types/LevelConfig';

interface Maze3DProps {
  level: LevelGeometry;
  config: LevelConfig;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => void;
}

/** Midpoint, length, and rotation (radians around Y) for a wall segment. */
function segmentTransform(seg: WallSegment) {
  const mx = (seg.x1 + seg.x2) / 2;
  const mz = (seg.z1 + seg.z2) / 2;
  const dx = seg.x2 - seg.x1;
  const dz = seg.z2 - seg.z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  // atan2 gives angle of the segment; we want rotation around Y axis
  const rotY = Math.atan2(dx, dz);
  return { mx, mz, length, rotY };
}

function renderWallSegment(
  seg: WallSegment,
  defaultColor: string,
  wallHeight: number,
): JSX.Element[] {
  const elements: JSX.Element[] = [];
  const { mx, mz, length, rotY } = segmentTransform(seg);
  const thickness = 0.2;

  if (seg.isDoor) {
    // Render a door opening: two side frames + top lintel + door panel
    const frameShare = 0.2; // each frame is 20% of total length
    const frameLen = length * frameShare;
    const openingLen = length * (1 - 2 * frameShare);

    // Left frame
    const lOff = -(openingLen / 2 + frameLen / 2);
    const lx = mx + Math.sin(rotY) * lOff;
    const lz = mz + Math.cos(rotY) * lOff;
    elements.push(
      <mesh key={`${seg.id}-frame-l`} position={[lx, wallHeight / 2, lz]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[thickness, wallHeight, frameLen]} />
        <meshStandardMaterial color={defaultColor} />
      </mesh>
    );

    // Right frame
    const rOff = openingLen / 2 + frameLen / 2;
    const rx = mx + Math.sin(rotY) * rOff;
    const rz = mz + Math.cos(rotY) * rOff;
    elements.push(
      <mesh key={`${seg.id}-frame-r`} position={[rx, wallHeight / 2, rz]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[thickness, wallHeight, frameLen]} />
        <meshStandardMaterial color={defaultColor} />
      </mesh>
    );

    // Top lintel
    elements.push(
      <mesh key={`${seg.id}-lintel`} position={[mx, wallHeight * 0.9, mz]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[thickness, wallHeight * 0.2, openingLen]} />
        <meshStandardMaterial color={defaultColor} />
      </mesh>
    );

    // Door panel
    const doorPanelLength = openingLen * 0.9;
    elements.push(
      <mesh
        key={`${seg.id}-door`}
        position={[mx, wallHeight * 0.4, mz]}
        rotation={[0, rotY, 0]}
        userData={{
          isDoor: true,
          position: { x: mx, y: wallHeight / 2, z: mz },
          // lateralSpan is used by FirstPersonController to size the door trigger zone
          lateralSpan: length,
        }}
      >
        <boxGeometry args={[thickness * 0.75, wallHeight * 0.8, doorPanelLength]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
    );
  } else {
    const color = seg.color ?? defaultColor;
    const h = seg.height;
    const py = h / 2;
    elements.push(
      <mesh key={seg.id} position={[mx, py, mz]} rotation={[0, rotY, 0]}>
        <boxGeometry args={[thickness, h, length]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }

  return elements;
}

export function Maze3D({ level, config }: Maze3DProps) {
  const walls = useMemo(() => {
    const elements: JSX.Element[] = [];
    for (const seg of level.walls) {
      elements.push(
        ...renderWallSegment(seg, config.wallColor, level.wallHeight)
      );
    }
    return elements;
  }, [level, config.wallColor]);

  const floor = useMemo(() => {
    const { minX, minZ, maxX, maxZ } = level.bounds;
    const w = maxX - minX;
    const d = maxZ - minZ;
    return (
      <mesh position={[minX + w / 2, -0.1, minZ + d / 2]}>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color={config.floorColor} />
      </mesh>
    );
  }, [level.bounds, config.floorColor]);

  const ceiling = useMemo(() => {
    const { minX, minZ, maxX, maxZ } = level.bounds;
    const w = maxX - minX;
    const d = maxZ - minZ;
    return (
      <mesh position={[minX + w / 2, level.wallHeight + 0.1, minZ + d / 2]}>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color={config.ceilingColor} />
      </mesh>
    );
  }, [level.bounds, level.wallHeight, config.ceilingColor]);

  return (
    <group>
      {walls}
      {floor}
      {ceiling}
    </group>
  );
}
