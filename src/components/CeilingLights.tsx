import { useMemo, type JSX } from "react";
import { Object3D } from "three";
import { type MazeCell } from "../utils/mazeGenerator";
import { type LightStyle } from "../types/LevelConfig";
import { placeLights, type LightFixture } from "../utils/lightPlacement";

interface CeilingLightsProps {
  maze: MazeCell[][];
  cellSize: number;
  wallHeight: number;
  seed: number;
  lightSpacing: number;
  lightStyle: LightStyle;
  lightGrid?: boolean;
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
  lightStyle,
  lightGrid,
  explicitLights,
}: CeilingLightsProps) {
  const fixtures = useMemo(
    () =>
      placeLights(
        maze,
        cellSize,
        wallHeight,
        seed,
        lightStyle,
        lightSpacing,
        explicitLights,
        lightGrid
      ),
    [maze, cellSize, wallHeight, seed, lightStyle, lightSpacing, lightGrid, explicitLights]
  );

  // Every real light is compiled into every material's shader, so a dense
  // fixture grid (lightGrid + low spacing) can blow the GPU's
  // MAX_FRAGMENT_UNIFORM_VECTORS limit. Emissive surfaces cost nothing —
  // above a budget, only every Nth fixture actually casts light; the rest
  // still glow.
  const POINT_LIGHT_BUDGET = 28;
  const totalLightCount = fixtures.reduce(
    (sum, f) => sum + (f.kind === "fluorescent" ? 2 : 1),
    0
  );
  const stride = Math.max(1, Math.ceil(totalLightCount / POINT_LIGHT_BUDGET));

  return (
    <>
      {fixtures.map((f, i) => {
        const key = `light-${i}-${f.cell.x}-${f.cell.z}`;
        const lit = i % stride === 0;
        switch (f.kind) {
          case "ceiling-pendant":
            return <CeilingPendant key={key} fixture={f} cellSize={cellSize} lit={lit} />;
          case "fluorescent":
            return <FluorescentPanel key={key} fixture={f} cellSize={cellSize} lit={lit} />;
          case "floor-lamp":
            return <FloorLamp key={key} fixture={f} cellSize={cellSize} lit={lit} />;
          case "corner-spot":
            return <CornerSpot key={key} fixture={f} cellSize={cellSize} lit={lit} />;
          case "wall-sconce":
            return <WallSconce key={key} fixture={f} cellSize={cellSize} lit={lit} />;
          case "ceiling-sconce":
            return <CeilingSconce key={key} fixture={f} cellSize={cellSize} lit={lit} />;
        }
      })}
    </>
  );
}

type PendantFixture = Extract<LightFixture, { kind: "ceiling-pendant" }>;
type SconceFixture = Extract<LightFixture, { kind: "wall-sconce" }>;
type CeilingSconceFixture = Extract<LightFixture, { kind: "ceiling-sconce" }>;
type FluorescentFixture = Extract<LightFixture, { kind: "fluorescent" }>;
type FloorLampFixture = Extract<LightFixture, { kind: "floor-lamp" }>;
type CornerSpotFixture = Extract<LightFixture, { kind: "corner-spot" }>;

function CeilingPendant({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: PendantFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { x, y, z } = fixture.position;
  // Seeded jitter so identical seeds give the same per-fixture offset; produces
  // gentle intensity variation between bulbs without true animation.
  const jitter = Math.sin(fixture.cell.x * 12.9898 + fixture.cell.z * 78.233) * 0.3;
  return (
    <group>
      <mesh position={[x, y + 0.2, z]}>
        <cylinderGeometry args={[0.15, 0.15, 0.2, 8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      <mesh position={[x, y + 0.05, z]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color="#fff3cd" emissive="#fff3cd" emissiveIntensity={0.8} />
      </mesh>
      {lit && (
        <pointLight
          position={[x, y, z]}
          intensity={3.5 + jitter}
          distance={cellSize * 3.5}
          decay={2}
          color="#fff3cd"
        />
      )}
    </group>
  );
}

function WallSconce({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: SconceFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { position, direction } = fixture;
  // Bracket sits behind the shade, flush against the wall face.
  const bx = position.x - direction.x * 0.18;
  const by = position.y;
  const bz = position.z - direction.z * 0.18;
  // Per-fixture jitter so no two sconces read identically bright.
  const jitter =
    Math.sin(fixture.cell.x * 12.9898 + fixture.cell.z * 78.233) * 0.4;
  return (
    <group>
      {/* Wall bracket */}
      <mesh position={[bx, by, bz]}>
        <boxGeometry args={[0.14, 0.3, 0.14]} />
        <meshStandardMaterial color="#2a2a28" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Cylindrical frosted-glass shade — the visible glow */}
      <mesh position={[position.x, position.y, position.z]}>
        <cylinderGeometry args={[0.1, 0.1, 0.26, 12]} />
        <meshStandardMaterial
          color="#f4f6f2"
          emissive="#e8ecdf"
          emissiveIntensity={4}
          roughness={0.4}
        />
      </mesh>
      {/* Cold-white pool of light on the wall and floor below */}
      {lit && (
        <pointLight
          position={[
            position.x + direction.x * 0.2,
            position.y - 0.05,
            position.z + direction.z * 0.2,
          ]}
          intensity={6.5 + jitter}
          distance={cellSize * 3.5}
          decay={2}
          color="#e6ecdc"
        />
      )}
    </group>
  );
}

function CeilingSconce({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: CeilingSconceFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { x, y, z } = fixture.position;
  const jitter =
    Math.sin(fixture.cell.x * 12.9898 + fixture.cell.z * 78.233) * 0.4;
  return (
    <group>
      {/* Drum housing flush against the ceiling */}
      <mesh position={[x, y + 0.08, z]}>
        <cylinderGeometry args={[0.16, 0.14, 0.12, 12]} />
        <meshStandardMaterial color="#2a2a28" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Frosted glass bottom face */}
      <mesh position={[x, y, z]}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 12]} />
        <meshStandardMaterial
          color="#f4f6f2"
          emissive="#e8ecdf"
          emissiveIntensity={4}
          roughness={0.4}
        />
      </mesh>
      {lit && (
        <pointLight
          position={[x, y - 0.15, z]}
          intensity={6.5 + jitter}
          distance={cellSize * 3.5}
          decay={2}
          color="#e6ecdc"
        />
      )}
    </group>
  );
}

function FluorescentPanel({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: FluorescentFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { x, y, z } = fixture.position;
  const panelW = cellSize * 0.75;
  const panelD = cellSize * 0.28;
  return (
    <group>
      {/* Slim metal housing flush against the ceiling */}
      <mesh position={[x, y + 0.32, z]}>
        <boxGeometry args={[panelW, 0.08, panelD]} />
        <meshStandardMaterial color="#dadada" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Diffuser face — the actual emissive surface */}
      <mesh position={[x, y + 0.27, z]}>
        <boxGeometry args={[panelW * 0.94, 0.03, panelD * 0.85]} />
        <meshStandardMaterial
          color="#fbf8e8"
          emissive="#f4ecc8"
          emissiveIntensity={1.6}
        />
      </mesh>
      {/* Twin lights along the panel axis approximate a long fluorescent tube.
          Warm sickly-white — aged office tubes, not clean daylight ones. */}
      {lit && (
        <>
          <pointLight
            position={[x - panelW * 0.28, y, z]}
            intensity={2.2}
            distance={cellSize * 4}
            decay={1.7}
            color="#f2ebc4"
          />
          <pointLight
            position={[x + panelW * 0.28, y, z]}
            intensity={2.2}
            distance={cellSize * 4}
            decay={1.7}
            color="#f2ebc4"
          />
        </>
      )}
    </group>
  );
}

function FloorLamp({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: FloorLampFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { position, direction } = fixture;
  // Build a Three.js target object so the spotlight has something to aim at.
  // useMemo + <primitive> ensures it joins the scene graph and gets matrix
  // updates each frame — without it, target.position changes never apply.
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(
      position.x + direction.x * 5,
      position.y + direction.y * 5,
      position.z + direction.z * 5
    );
    return o;
  }, [position.x, position.y, position.z, direction.x, direction.y, direction.z]);

  return (
    <group>
      {/* Lantern body — squat cylinder like a dropped flashlight or work light */}
      <mesh position={[position.x, position.y, position.z]}>
        <cylinderGeometry args={[0.13, 0.16, 0.32, 10]} />
        <meshStandardMaterial color="#1c1c1c" metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Lens disc on top */}
      <mesh position={[position.x, position.y + 0.18, position.z]}>
        <cylinderGeometry args={[0.105, 0.105, 0.04, 14]} />
        <meshStandardMaterial
          color="#fff0c8"
          emissive="#ffd08a"
          emissiveIntensity={25}
        />
      </mesh>
      <primitive object={target} />
      {lit && (
        <spotLight
          position={[position.x, position.y + 0.2, position.z]}
          target={target}
          intensity={45}
          distance={cellSize * 6}
          angle={Math.PI / 3}
          penumbra={0.7}
          decay={1.8}
          color="#ffc878"
        />
      )}
    </group>
  );
}

function CornerSpot({
  fixture,
  cellSize,
  lit = true,
}: {
  fixture: CornerSpotFixture;
  cellSize: number;
  lit?: boolean;
}): JSX.Element {
  const { position, direction } = fixture;
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(
      position.x + direction.x * 5,
      position.y + direction.y * 5,
      position.z + direction.z * 5
    );
    return o;
  }, [position.x, position.y, position.z, direction.x, direction.y, direction.z]);

  // Lens sits a bit out from the bracket along the aim direction so the
  // emissive face reads correctly from the room interior.
  const lensX = position.x + direction.x * 0.14;
  const lensY = position.y + direction.y * 0.14;
  const lensZ = position.z + direction.z * 0.14;

  return (
    <group>
      {/* Compact mounting bracket clipped to the corner */}
      <mesh position={[position.x, position.y, position.z]}>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.55} />
      </mesh>
      {/* Lens / bulb */}
      <mesh position={[lensX, lensY, lensZ]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial
          color="#fff2d0"
          emissive="#ffd9a4"
          emissiveIntensity={27.5}
        />
      </mesh>
      <primitive object={target} />
      {lit && (
        <spotLight
          position={[position.x, position.y, position.z]}
          target={target}
          intensity={55}
          distance={cellSize * 7}
          angle={Math.PI / 5}
          penumbra={0.55}
          decay={1.8}
          color="#ffd49a"
        />
      )}
    </group>
  );
}
