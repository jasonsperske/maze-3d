import { useMemo, useEffect, useRef, type JSX } from 'react';
import * as THREE from 'three';
import { type MazeCell } from '../utils/mazeGenerator';
import { type LevelConfig } from '../types/LevelConfig';
import { useLevelTextures } from '../hooks/useLevelTextures';
import { getTileSize } from '../utils/textureLoader';
import { makeFbm } from '../utils/noise';
import { type Pillar } from '../utils/openPlan';

// Murky canvas for hung pictures: dark green-brown fbm clouds darkened toward
// the edges so nothing in the image is ever quite readable. One shared texture
// for all frames; per-frame material tints keep them from reading identical.
function makeMurkyPictureTexture(seed: number): THREE.CanvasTexture {
  const size = 128;
  const fbm = makeFbm(seed, 5);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  const c0 = { r: 24, g: 27, b: 21 };
  const c1 = { r: 96, g: 100, b: 84 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const edge = Math.min(1, 16 * u * (1 - u) * v * (1 - v));
      const t = Math.max(0, Math.min(1, fbm(u, v))) * (0.3 + 0.7 * edge);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(c0.r + (c1.r - c0.r) * t);
      data[idx + 1] = Math.round(c0.g + (c1.g - c0.g) * t);
      data[idx + 2] = Math.round(c0.b + (c1.b - c0.b) * t);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
  // Freestanding columns from the open-plan pass.
  pillars?: Pillar[];
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

export function Maze3D({ maze, cellSize, wallHeight, seed, config, explicitDoors, pillars }: Maze3DProps) {
  const textures = useLevelTextures(config);

  const pictureTexture = useMemo(
    () => (config.pictures ? makeMurkyPictureTexture(seed ^ 0x91c7) : null),
    [config.pictures, seed]
  );
  useEffect(() => {
    return () => {
      pictureTexture?.dispose();
    };
  }, [pictureTexture]);

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
    // Separate stream for pictures for the same reason: doorUtils replicates
    // the door stream draw-for-draw, so nothing else may consume from it.
    const pictureRandom = makeSeededRandom(seed ^ 0x91c7);

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

        // Baseboard + crown moulding: boxes slightly proud of the wall on both
        // faces. NS and EW strips get marginally different heights so their top
        // faces never sit coplanar where they intersect at corners.
        if (config.trim && !isHalf) {
          const proudW = fullW + (isNS ? 0 : 0.12);
          const proudD = fullD + (isNS ? 0.12 : 0);
          const baseH = isNS ? 0.22 : 0.215;
          const crownH = isNS ? 0.14 : 0.137;
          const trimMaterial = (
            <meshStandardMaterial
              color={config.trim.color}
              roughness={config.trim.roughness ?? 0.6}
              metalness={0}
            />
          );
          elements.push(
            <mesh key={`${key}-base`} position={[px, baseH / 2, pz]}>
              <boxGeometry args={[proudW, baseH, proudD]} />
              {trimMaterial}
            </mesh>
          );
          if (config.trim.crown ?? true) {
            elements.push(
              <mesh key={`${key}-crown`} position={[px, wallHeight - crownH / 2, pz]}>
                <boxGeometry args={[proudW, crownH, proudD]} />
                {trimMaterial}
              </mesh>
            );
          }
        }

        // Framed pictures: each face of the wall gets an independent chance.
        // A frame is a backing board with a smaller murky "canvas" mounted
        // proud of it; low canvas roughness reads as glass under a light.
        if (config.pictures && !isHalf) {
          const frameColor = config.pictures.frameColor ?? '#5a4030';
          const sizes: Array<[number, number]> = [
            [0.65, 0.85], [0.9, 0.7], [0.55, 0.65], [0.75, 1.0],
          ];
          for (const side of [-1, 1] as const) {
            if (pictureRandom() >= config.pictures.frequency) continue;
            const [pw, ph] = sizes[Math.floor(pictureRandom() * sizes.length)];
            const cy = 1.55 + (pictureRandom() - 0.5) * 0.3;
            const along =
              (pictureRandom() - 0.5) * Math.max(0, cellSize - pw - 1.8);
            const tint = ['#a8ad9c', '#b3a291', '#98a4ad', '#9aa08e'][
              Math.floor(pictureRandom() * 4)
            ];

            const [fx, fz] = isNS
              ? [px + along, pz + side * 0.14]
              : [px + side * 0.14, pz + along];
            const [ix, iz] = isNS
              ? [px + along, pz + side * 0.18]
              : [px + side * 0.18, pz + along];

            elements.push(
              <mesh key={`${key}-frame-${side}`} position={[fx, cy, fz]}>
                <boxGeometry
                  args={isNS ? [pw, ph, 0.06] : [0.06, ph, pw]}
                />
                <meshStandardMaterial
                  color={frameColor}
                  roughness={0.55}
                  metalness={0}
                />
              </mesh>
            );
            elements.push(
              <mesh key={`${key}-picture-${side}`} position={[ix, cy, iz]}>
                <boxGeometry
                  args={
                    isNS
                      ? [pw * 0.8, ph * 0.78, 0.03]
                      : [0.03, ph * 0.78, pw * 0.8]
                  }
                />
                <meshStandardMaterial
                  color={tint}
                  map={pictureTexture}
                  roughness={0.2}
                  metalness={0}
                />
              </mesh>
            );
          }
        }
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
    pictureTexture,
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

  // Freestanding columns share the wall material so they read as structure
  const pillarMeshes = useMemo(() => {
    if (!pillars || pillars.length === 0) return null;
    return pillars.map((p, i) => (
      <group key={`pillar-${i}`}>
        <mesh position={[p.x, wallHeight / 2, p.z]}>
          <boxGeometry args={[p.size, wallHeight, p.size]} />
          <SurfaceMaterial
            color={config.wallColor}
            map={textures.wall}
            normalMap={textures.wallNormal}
            normalScale={config.wallNormalScale ?? 1}
            roughness={config.wallRoughness ?? 1}
          />
        </mesh>
        {config.trim && (
          <mesh position={[p.x, 0.11, p.z]}>
            <boxGeometry args={[p.size + 0.1, 0.22, p.size + 0.1]} />
            <meshStandardMaterial
              color={config.trim.color}
              roughness={config.trim.roughness ?? 0.6}
              metalness={0}
            />
          </mesh>
        )}
      </group>
    ));
  }, [pillars, wallHeight, config, textures.wall, textures.wallNormal]);

  return (
    <group>
      {walls}
      {floor}
      {ceiling}
      {pillarMeshes}
    </group>
  );
}
