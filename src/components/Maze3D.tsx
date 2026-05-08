import { useMemo, useEffect, useRef, type JSX } from 'react';
import * as THREE from 'three';
import { type MazeCell } from '../utils/mazeGenerator';
import { type LevelConfig } from '../types/LevelConfig';
import { useLevelTextures } from '../hooks/useLevelTextures';
import { getTileSize } from '../utils/textureLoader';

// MeshStandardMaterial only adds the USE_MAP / USE_NORMALMAP defines when the
// shader is first compiled, so transitioning these from null → Texture after
// mount needs an explicit needsUpdate or the texture binds but never appears.
function SurfaceMaterial({
  color,
  map,
  normalMap,
  normalScale = 1,
  roughness = 1,
}: {
  color: string;
  map: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: number;
  roughness?: number;
}) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    if (ref.current) ref.current.needsUpdate = true;
  }, [map, normalMap]);
  const scale = useMemo(
    () => new THREE.Vector2(normalScale, normalScale),
    [normalScale]
  );
  return (
    <meshStandardMaterial
      ref={ref}
      color={color}
      map={map}
      normalMap={normalMap ?? undefined}
      normalScale={scale}
      roughness={roughness}
      metalness={0}
    />
  );
}

interface Maze3DProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
  seed: number;
  config: LevelConfig;
  // When set, doors are placed only at these wall positions (key = "x,z,direction").
  // Bypasses random door placement and disables half-height partitions.
  explicitDoors?: Map<string, string>;
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

export function Maze3D({ maze, cellSize, wallHeight, seed, config, explicitDoors }: Maze3DProps) {
  const textures = useLevelTextures(config);

  const mazeWidth = maze.length * cellSize;
  const mazeDepth = maze[0].length * cellSize;

  // Repeat values are per-surface: each surface needs its own tiling factor
  // because tileSize is in world units and surfaces have different dimensions.
  // Normal maps tile alongside their colour map using the colour map's tile
  // size when the normal map doesn't specify one of its own.
  useEffect(() => {
    if (textures.wall) {
      const tile = getTileSize(config.wallTexture, cellSize);
      textures.wall.repeat.set(cellSize / tile, wallHeight / tile);
      textures.wall.needsUpdate = true;
    }
    if (textures.wallNormal) {
      const tile = getTileSize(config.wallNormalMap, getTileSize(config.wallTexture, cellSize));
      textures.wallNormal.repeat.set(cellSize / tile, wallHeight / tile);
      textures.wallNormal.needsUpdate = true;
    }
    if (textures.floor) {
      const tile = getTileSize(config.floorTexture, cellSize);
      textures.floor.repeat.set(mazeWidth / tile, mazeDepth / tile);
      textures.floor.needsUpdate = true;
    }
    if (textures.floorNormal) {
      const tile = getTileSize(config.floorNormalMap, getTileSize(config.floorTexture, cellSize));
      textures.floorNormal.repeat.set(mazeWidth / tile, mazeDepth / tile);
      textures.floorNormal.needsUpdate = true;
    }
    if (textures.ceiling) {
      const tile = getTileSize(config.ceilingTexture, cellSize);
      textures.ceiling.repeat.set(mazeWidth / tile, mazeDepth / tile);
      textures.ceiling.needsUpdate = true;
    }
    if (textures.ceilingNormal) {
      const tile = getTileSize(config.ceilingNormalMap, getTileSize(config.ceilingTexture, cellSize));
      textures.ceilingNormal.repeat.set(mazeWidth / tile, mazeDepth / tile);
      textures.ceilingNormal.needsUpdate = true;
    }
  }, [
    textures.wall,
    textures.floor,
    textures.ceiling,
    textures.wallNormal,
    textures.floorNormal,
    textures.ceilingNormal,
    config.wallTexture,
    config.floorTexture,
    config.ceilingTexture,
    config.wallNormalMap,
    config.floorNormalMap,
    config.ceilingNormalMap,
    cellSize,
    wallHeight,
    mazeWidth,
    mazeDepth,
  ]);

  const walls = useMemo(() => {
    const elements: JSX.Element[] = [];
    const random = makeSeededRandom(seed);
    // Separate stream for half-height so door randomisation is unaffected
    const halfRandom = makeSeededRandom(seed ^ 0xf00d);

    const wallMaterial = (color: string) => (
      <SurfaceMaterial
        color={color}
        map={textures.wall}
        normalMap={textures.wallNormal}
        normalScale={config.wallNormalScale ?? 1}
        roughness={config.wallRoughness ?? 1}
      />
    );

    // Helper: render one wall segment (door or plain, full or half-height).
    // pos: center position  dims: [w, h, d] of a full-height plain wall
    // isNS: true for north/south walls (door opening is along X), false for east/west (along Z)
    const renderWall = (
      key: string,
      px: number, pz: number,
      fullW: number, fullD: number,
      isNS: boolean,
      cellX: number,
      cellZ: number,
      direction: "north" | "south" | "east" | "west"
    ) => {
      const hasDoor = explicitDoors
        ? explicitDoors.has(`${cellX},${cellZ},${direction}`)
        : random() < config.doorFrequency;
      const isHalf =
        !hasDoor &&
        !explicitDoors &&
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
            {wallMaterial(config.wallColor)}
          </mesh>
        );
        elements.push(
          <mesh key={`${key}-right`} position={[rx, wallHeight / 2, rz]}>
            <boxGeometry args={[frameW, wallHeight, frameD]} />
            {wallMaterial(config.wallColor)}
          </mesh>
        );

        // Top frame above the opening
        const topW = isNS ? cellSize * 0.2 : 0.2;
        const topD = isNS ? 0.2 : cellSize * 0.2;
        elements.push(
          <mesh key={`${key}-top`} position={[px, wallHeight * 0.9, pz]}>
            <boxGeometry args={[topW, wallHeight * 0.2, topD]} />
            {wallMaterial(config.wallColor)}
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
            <meshStandardMaterial color="#8B4513" roughness={0.7} metalness={0} />
          </mesh>
        );
      } else {
        elements.push(
          <mesh key={key} position={[px, py, pz]}>
            <boxGeometry args={[fullW, h, fullD]} />
            {wallMaterial(color)}
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
            true,
            x, z, "north"
          );
        }
        if (cell.walls.south) {
          renderWall(
            `wall-south-${x}-${z}`,
            baseX, baseZ + cellSize / 2,
            cellSize, 0.2,
            true,
            x, z, "south"
          );
        }
        if (cell.walls.east) {
          renderWall(
            `wall-east-${x}-${z}`,
            baseX + cellSize / 2, baseZ,
            0.2, cellSize,
            false,
            x, z, "east"
          );
        }
        if (cell.walls.west) {
          renderWall(
            `wall-west-${x}-${z}`,
            baseX - cellSize / 2, baseZ,
            0.2, cellSize,
            false,
            x, z, "west"
          );
        }
      });
    });

    return elements;
  }, [
    maze,
    cellSize,
    wallHeight,
    seed,
    config,
    explicitDoors,
    textures.wall,
    textures.wallNormal,
  ]);

  const floor = useMemo(() => {
    return (
      <mesh position={[mazeWidth / 2, -0.1, mazeDepth / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
        <SurfaceMaterial
          color={config.floorColor}
          map={textures.floor}
          normalMap={textures.floorNormal}
          normalScale={config.floorNormalScale ?? 1}
          roughness={config.floorRoughness ?? 1}
        />
      </mesh>
    );
  }, [
    mazeWidth,
    mazeDepth,
    config.floorColor,
    config.floorNormalScale,
    config.floorRoughness,
    textures.floor,
    textures.floorNormal,
  ]);

  const ceiling = useMemo(() => {
    return (
      <mesh position={[mazeWidth / 2, wallHeight + 0.1, mazeDepth / 2]}>
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
        <SurfaceMaterial
          color={config.ceilingColor}
          map={textures.ceiling}
          normalMap={textures.ceilingNormal}
          normalScale={config.ceilingNormalScale ?? 1}
          roughness={config.ceilingRoughness ?? 1}
        />
      </mesh>
    );
  }, [
    mazeWidth,
    mazeDepth,
    wallHeight,
    config.ceilingColor,
    config.ceilingNormalScale,
    config.ceilingRoughness,
    textures.ceiling,
    textures.ceilingNormal,
  ]);

  return (
    <group>
      {walls}
      {floor}
      {ceiling}
    </group>
  );
}
