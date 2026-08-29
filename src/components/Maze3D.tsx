import { useMemo, useEffect, useRef, type JSX, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type MazeCell } from '../utils/mazeGenerator';
import { type LevelConfig } from '../types/LevelConfig';
import { useLevelTextures } from '../hooks/useLevelTextures';
import { getTileSize } from '../utils/textureLoader';
import { makeFbm } from '../utils/noise';
import { type Pillar } from '../utils/openPlan';
import { computeWallLayout, NORTH, SOUTH, EAST, WEST, type Direction } from '../utils/wallLayout';
import { VisibilitySolver, sightRange } from '../utils/visibility';

// ?cull=off puts every cell back on screen, for when something looks wrong in
// a headset and the question is whether the culler is the reason.
const CULLING_ENABLED = (() => {
  try {
    return new URLSearchParams(window.location.search).get('cull') !== 'off';
  } catch {
    return true;
  }
})();

// Walls you cannot see are switched off rather than drawn.
//
// Three frustum-culls every mesh for free but has no notion of occlusion, so
// down a corridor it submits every room behind the wall in front of you. The
// solver floods outward through the openings from the eye and hands back the
// cells worth drawing; setting a cell group's visible flag false makes
// projectObject return immediately and skip that whole subtree.
function CellCulling({
  solver,
  groups,
  range,
}: {
  solver: VisibilitySolver;
  groups: RefObject<(THREE.Group | null)[]>;
  range: number;
}) {
  const eye = useRef(new THREE.Vector3());
  const solvedAt = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));

  useFrame(({ camera }) => {
    camera.getWorldPosition(eye.current);
    // The visible set covers all 360 degrees, so it only goes stale when the
    // eye moves — turning your head in a headset costs nothing. A quarter of a
    // unit is nothing next to the one-cell dilation the solver already applies.
    if (eye.current.distanceToSquared(solvedAt.current) > 0.0625) {
      solvedAt.current.copy(eye.current);
      solver.solve(eye.current.x, eye.current.z, range);
    }
    // Reapplied every frame even when the solve is skipped: the cell groups
    // remount whenever the level's materials are rebuilt, and they come back
    // from React visible.
    const drawn = solver.drawn;
    const list = groups.current;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g !== null) g.visible = drawn[i] === 1;
    }
  });

  return null;
}

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

// One material instance per distinct surface, shared by every mesh wearing it.
//
// Three sorts opaque draws by groupOrder → renderOrder → material.id → depth.
// A per-mesh <meshStandardMaterial> element gives every wall its own instance,
// which collapsed that sort onto material.id — that is, onto the order the
// walls happened to be constructed in, which is maze traversal order. Walls
// were being submitted in essentially random depth order, exactly the order
// that defeats early-Z rejection on a tiled mobile GPU. Sharing instances
// restores the front-to-back sort and turns thousands of per-draw uniform
// uploads into a dozen.
//
// These are rebuilt rather than mutated when the textures finish loading, so
// the USE_MAP / USE_NORMALMAP defines are present at first shader compile and
// the old needsUpdate dance is unnecessary.
function makeSurfaceMaterial(
  color: string,
  map: THREE.Texture | null,
  normalMap: THREE.Texture | null,
  normalScale: number,
  roughness: number
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness,
    metalness: 0,
  });
}

// The only two surfaces with no configurable colour.
const DOOR_COLOR = '#8B4513';
const PICTURE_TINTS = ['#a8ad9c', '#b3a291', '#98a4ad', '#9aa08e'];

interface SurfaceMaterials {
  wall: THREE.MeshStandardMaterial;
  halfWall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial | null;
  pictureFrame: THREE.MeshStandardMaterial | null;
  pictureCanvas: THREE.MeshStandardMaterial[];
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

  const materials = useMemo<SurfaceMaterials>(
    () => ({
      wall: makeSurfaceMaterial(
        config.wallColor, textures.wall, textures.wallNormal,
        config.wallNormalScale ?? 1, config.wallRoughness ?? 1
      ),
      halfWall: makeSurfaceMaterial(
        config.halfHeightColor, textures.wall, textures.wallNormal,
        config.wallNormalScale ?? 1, config.wallRoughness ?? 1
      ),
      floor: makeSurfaceMaterial(
        config.floorColor, textures.floor, textures.floorNormal,
        config.floorNormalScale ?? 1, config.floorRoughness ?? 1
      ),
      ceiling: makeSurfaceMaterial(
        config.ceilingColor, textures.ceiling, textures.ceilingNormal,
        config.ceilingNormalScale ?? 1, config.ceilingRoughness ?? 1
      ),
      door: new THREE.MeshStandardMaterial({
        color: DOOR_COLOR, roughness: 0.7, metalness: 0,
      }),
      trim: config.trim
        ? new THREE.MeshStandardMaterial({
            color: config.trim.color,
            roughness: config.trim.roughness ?? 0.6,
            metalness: 0,
          })
        : null,
      pictureFrame: config.pictures
        ? new THREE.MeshStandardMaterial({
            color: config.pictures.frameColor ?? '#5a4030',
            roughness: 0.55,
            metalness: 0,
          })
        : null,
      // Low roughness reads as glass over the murky canvas under a light.
      pictureCanvas: config.pictures
        ? PICTURE_TINTS.map(
            (tint) =>
              new THREE.MeshStandardMaterial({
                color: tint,
                map: pictureTexture,
                roughness: 0.2,
                metalness: 0,
              })
          )
        : [],
    }),
    [config, textures, pictureTexture]
  );

  // Passed to meshes by prop rather than built as JSX children, so r3f does not
  // own them and will not dispose them for us.
  useEffect(() => {
    return () => {
      for (const entry of Object.values(materials)) {
        if (Array.isArray(entry)) entry.forEach((m) => m.dispose());
        else entry?.dispose();
      }
    };
  }, [materials]);

  const mazeWidth = maze.length * cellSize;
  const mazeDepth = maze[0].length * cellSize;

  // What every wall turned out to be, decided once so the geometry below and
  // the visibility flood above cannot disagree about which walls you see
  // through. Replaces the door and half-height streams this component used to
  // roll inline.
  const layout = useMemo(
    () => computeWallLayout(maze, seed, config, explicitDoors),
    [maze, seed, config, explicitDoors]
  );
  const solver = useMemo(() => new VisibilitySolver(layout, cellSize), [layout, cellSize]);
  const range = useMemo(
    () => sightRange(config.fog, layout.width, layout.height, cellSize),
    [config.fog, layout, cellSize]
  );
  // One slot per cell, indexed the same way the solver indexes `drawn`.
  const cellGroups = useRef<(THREE.Group | null)[]>([]);
  if (cellGroups.current.length !== layout.width * layout.height) {
    cellGroups.current = new Array(layout.width * layout.height).fill(null);
  }

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
    const cells: JSX.Element[] = [];
    const height = layout.height;
    // The picture stream stays here — it is seeded separately and never
    // interleaves with the door and half-height streams the layout owns.
    const pictureRandom = makeSeededRandom(seed ^ 0x91c7);

    // Helper: render one wall segment (door or plain, full or half-height).
    // pos: center position  dims: [w, h, d] of a full-height plain wall
    // isNS: true for north/south walls (door opening is along X), false for east/west (along Z)
    const renderWall = (
      elements: JSX.Element[],
      key: string,
      px: number, pz: number,
      fullW: number, fullD: number,
      isNS: boolean,
      cellX: number,
      cellZ: number,
      direction: Direction
    ) => {
      const kind = layout.kind(cellX, cellZ, direction);
      const hasDoor = kind === "door";
      const isHalf = kind === "half";

      const h = isHalf ? wallHeight / 2 : wallHeight;
      const py = h / 2;

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
          <mesh key={`${key}-left`} position={[lx, wallHeight / 2, lz]} material={materials.wall}>
            <boxGeometry args={[frameW, wallHeight, frameD]} />
          </mesh>
        );
        elements.push(
          <mesh key={`${key}-right`} position={[rx, wallHeight / 2, rz]} material={materials.wall}>
            <boxGeometry args={[frameW, wallHeight, frameD]} />
          </mesh>
        );

        // Top frame above the opening
        const topW = isNS ? cellSize * 0.2 : 0.2;
        const topD = isNS ? 0.2 : cellSize * 0.2;
        elements.push(
          <mesh key={`${key}-top`} position={[px, wallHeight * 0.9, pz]} material={materials.wall}>
            <boxGeometry args={[topW, wallHeight * 0.2, topD]} />
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
            material={materials.door}
          >
            <boxGeometry args={[doorW, wallHeight * 0.8, doorD]} />
          </mesh>
        );
      } else {
        elements.push(
          <mesh
            key={key}
            position={[px, py, pz]}
            material={isHalf ? materials.halfWall : materials.wall}
          >
            <boxGeometry args={[fullW, h, fullD]} />
          </mesh>
        );

        // Baseboard + crown moulding: boxes slightly proud of the wall on both
        // faces. NS and EW strips get marginally different heights so their top
        // faces never sit coplanar where they intersect at corners.
        if (config.trim && materials.trim && !isHalf) {
          const proudW = fullW + (isNS ? 0 : 0.12);
          const proudD = fullD + (isNS ? 0.12 : 0);
          const baseH = isNS ? 0.22 : 0.215;
          const crownH = isNS ? 0.14 : 0.137;
          elements.push(
            <mesh key={`${key}-base`} position={[px, baseH / 2, pz]} material={materials.trim}>
              <boxGeometry args={[proudW, baseH, proudD]} />
            </mesh>
          );
          if (config.trim.crown ?? true) {
            elements.push(
              <mesh
                key={`${key}-crown`}
                position={[px, wallHeight - crownH / 2, pz]}
                material={materials.trim}
              >
                <boxGeometry args={[proudW, crownH, proudD]} />
              </mesh>
            );
          }
        }

        // Framed pictures: each face of the wall gets an independent chance.
        // A frame is a backing board with a smaller murky "canvas" mounted
        // proud of it; low canvas roughness reads as glass under a light.
        if (config.pictures && materials.pictureFrame && !isHalf) {
          const sizes: Array<[number, number]> = [
            [0.65, 0.85], [0.9, 0.7], [0.55, 0.65], [0.75, 1.0],
          ];
          for (const side of [-1, 1] as const) {
            if (pictureRandom() >= config.pictures.frequency) continue;
            const [pw, ph] = sizes[Math.floor(pictureRandom() * sizes.length)];
            const cy = 1.55 + (pictureRandom() - 0.5) * 0.3;
            const along =
              (pictureRandom() - 0.5) * Math.max(0, cellSize - pw - 1.8);
            const canvasMaterial =
              materials.pictureCanvas[Math.floor(pictureRandom() * 4)];

            const [fx, fz] = isNS
              ? [px + along, pz + side * 0.14]
              : [px + side * 0.14, pz + along];
            const [ix, iz] = isNS
              ? [px + along, pz + side * 0.18]
              : [px + side * 0.18, pz + along];

            elements.push(
              <mesh
                key={`${key}-frame-${side}`}
                position={[fx, cy, fz]}
                material={materials.pictureFrame}
              >
                <boxGeometry
                  args={isNS ? [pw, ph, 0.06] : [0.06, ph, pw]}
                />
              </mesh>
            );
            elements.push(
              <mesh
                key={`${key}-picture-${side}`}
                position={[ix, cy, iz]}
                material={canvasMaterial}
              >
                <boxGeometry
                  args={
                    isNS
                      ? [pw * 0.8, ph * 0.78, 0.03]
                      : [0.03, ph * 0.78, pw * 0.8]
                  }
                />
              </mesh>
            );
          }
        }
      }
    };

    // Grouped by cell so the culler can switch a whole cell's geometry off
    // with one flag instead of touching every mesh in it.
    maze.forEach((row, x) => {
      row.forEach((cell, z) => {
        const baseX = x * cellSize + cellSize / 2;
        const baseZ = z * cellSize + cellSize / 2;
        const elements: JSX.Element[] = [];

        if (cell.walls.north) {
          renderWall(elements, `wall-north-${x}-${z}`,
            baseX, baseZ - cellSize / 2, cellSize, 0.2, true, x, z, NORTH);
        }
        if (cell.walls.south) {
          renderWall(elements, `wall-south-${x}-${z}`,
            baseX, baseZ + cellSize / 2, cellSize, 0.2, true, x, z, SOUTH);
        }
        if (cell.walls.east) {
          renderWall(elements, `wall-east-${x}-${z}`,
            baseX + cellSize / 2, baseZ, 0.2, cellSize, false, x, z, EAST);
        }
        if (cell.walls.west) {
          renderWall(elements, `wall-west-${x}-${z}`,
            baseX - cellSize / 2, baseZ, 0.2, cellSize, false, x, z, WEST);
        }

        if (elements.length === 0) return; // open-plan cells with nothing left
        const slot = x * height + z;
        cells.push(
          <group
            key={`cell-${x}-${z}`}
            ref={(g) => { cellGroups.current[slot] = g; }}
          >
            {elements}
          </group>
        );
      });
    });

    return cells;
  }, [
    maze,
    cellSize,
    wallHeight,
    seed,
    config,
    layout,
    materials,
  ]);

  const floor = useMemo(() => {
    return (
      <mesh
        position={[mazeWidth / 2, -0.1, mazeDepth / 2]}
        material={materials.floor}
      >
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
      </mesh>
    );
  }, [mazeWidth, mazeDepth, materials.floor]);

  const ceiling = useMemo(() => {
    return (
      <mesh
        position={[mazeWidth / 2, wallHeight + 0.1, mazeDepth / 2]}
        material={materials.ceiling}
      >
        <boxGeometry args={[mazeWidth, 0.2, mazeDepth]} />
      </mesh>
    );
  }, [mazeWidth, mazeDepth, wallHeight, materials.ceiling]);

  // Freestanding columns share the wall material so they read as structure
  const pillarMeshes = useMemo(() => {
    if (!pillars || pillars.length === 0) return null;
    return pillars.map((p, i) => (
      <group key={`pillar-${i}`}>
        <mesh position={[p.x, wallHeight / 2, p.z]} material={materials.wall}>
          <boxGeometry args={[p.size, wallHeight, p.size]} />
        </mesh>
        {materials.trim && (
          <mesh position={[p.x, 0.11, p.z]} material={materials.trim}>
            <boxGeometry args={[p.size + 0.1, 0.22, p.size + 0.1]} />
          </mesh>
        )}
      </group>
    ));
  }, [pillars, wallHeight, materials.wall, materials.trim]);

  return (
    <group>
      {CULLING_ENABLED && (
        <CellCulling solver={solver} groups={cellGroups} range={range} />
      )}
      {walls}
      {floor}
      {ceiling}
      {pillarMeshes}
    </group>
  );
}
