import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Vector3, Euler } from "three";
import { MazeGenerator } from "../utils/mazeGenerator";
import { getLevelProvider } from "../providers";
import { Maze3D } from "./Maze3D";
import { FirstPersonController } from "./FirstPersonController";
import { Flashlight } from "./Flashlight";
import { CeilingLights } from "./CeilingLights";
import { storeMazeData, listMazeDoors } from "../utils/doorUtils";
import { apiDoorCollision } from "../handlers/apiDoorCollision";
import { type DoorCollisionContext } from "../handlers/types";
import { type LevelConfig } from "../types/LevelConfig";
import { getShaderComponent } from "../shaders";

interface MazeGameProps {
  config: LevelConfig;
  level: string;
  seed: string;
}

function seedFromString(s: string): number {
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
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

export function MazeGame({ config, level, seed: seedProp }: MazeGameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraRotation, setCameraRotation] = useState(
    new Euler(0, 0, 0, "YXZ")
  );
  const [forceReload, setForceReload] = useState(0);
  const [flashlightIntensity, setFlashlightIntensity] = useState(1);

  const provider = useMemo(() => getLevelProvider(config.walldef), [config.walldef]);

  const { seed, initialPosition, initialRotation } = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParam = urlParams.get("hash");

    if (hashParam) {
      try {
        const state = JSON.parse(atob(hashParam));
        if (
          state.seed &&
          typeof state.seed === "number" &&
          state.position &&
          typeof state.position.x === "number" &&
          typeof state.position.y === "number" &&
          typeof state.position.z === "number" &&
          state.rotation &&
          typeof state.rotation.x === "number" &&
          typeof state.rotation.y === "number" &&
          typeof state.rotation.z === "number"
        ) {
          storeMazeData({
            seed: state.seed,
            position: state.position,
            rotation: state.rotation,
          });
          return {
            seed: state.seed,
            initialPosition: new Vector3(
              state.position.x,
              state.position.y,
              state.position.z
            ),
            initialRotation: new Euler(
              state.rotation.x,
              state.rotation.y,
              state.rotation.z,
              "YXZ"
            ),
          };
        }
      } catch {
        // invalid hash param — fall through
      }
    }

    const seedValue = seedFromString(seedProp);
    // For 3DMaze, use MazeGenerator to get a consistent start position.
    // For other providers, the start position comes from the level geometry.
    const generator = new MazeGenerator(25, 25, seedValue);
    generator.generate();
    const start = generator.getStartPosition();
    return {
      seed: seedValue,
      initialPosition: new Vector3(start.x, 1.7, start.z),
      initialRotation: new Euler(0, 0, 0, "YXZ"),
    };
  }, [forceReload, seedProp]);

  const levelGeometry = useMemo(() => {
    return provider.generate({ seed, config });
  }, [provider, seed, config]);

  // After level geometry is generated, override initial position from provider's
  // playerStart when not coming from a hash (the hash path sets initialPosition above).
  const effectiveInitialPosition = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("hash")) return initialPosition;
    const ps = levelGeometry.playerStart;
    return new Vector3(ps.x, ps.y, ps.z);
  }, [levelGeometry, initialPosition]);

  const effectiveInitialRotation = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("hash")) return initialRotation;
    const rotY = levelGeometry.playerStart.rotationY ?? 0;
    return new Euler(0, rotY, 0, "YXZ");
  }, [levelGeometry, initialRotation]);

  const [playerPosition, setPlayerPosition] = useState(effectiveInitialPosition);

  useEffect(() => {
    if (effectiveInitialRotation) setCameraRotation(effectiveInitialRotation);
  }, [effectiveInitialRotation]);

  const handlePositionChange = useCallback((position: Vector3) => {
    setPlayerPosition(position);
  }, []);

  const handleRotationChange = useCallback((rotation: Euler) => {
    setCameraRotation(rotation);
  }, []);

  const saveState = useCallback(() => {
    const state = {
      seed,
      position: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
      rotation: { x: cameraRotation.x, y: cameraRotation.y, z: cameraRotation.z },
    };
    const url = `${window.location.origin}/level/${level}/${seedProp}?hash=${btoa(JSON.stringify(state))}`;
    window.location.href = url;
  }, [seed, playerPosition, cameraRotation, level, seedProp]);

  const letThereBeLight = useCallback((factor: number = 1) => {
    setFlashlightIntensity(factor);
    return `Flashlight intensity set to ${factor}x`;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        (window as any).pendingDetection = { x: 0, y: 0 };
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadState = useCallback((hash?: string) => {
    try {
      const hashToLoad = hash || new URLSearchParams(window.location.search).get("hash") || "";
      if (!hashToLoad) return false;
      JSON.parse(atob(hashToLoad));
      setForceReload((prev) => prev + 1);
      return true;
    } catch {
      setForceReload((prev) => prev + 1);
      return false;
    }
  }, []);

  // Build door ID map from wall segments that have isDoor = true
  const doorIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const seg of levelGeometry.walls) {
      if (seg.isDoor && seg.id) {
        const mx = (seg.x1 + seg.x2) / 2;
        const mz = (seg.z1 + seg.z2) / 2;
        map.set(`${mx},${mz}`, seg.id);
      }
    }
    return map;
  }, [levelGeometry.walls]);

  // For 3DMaze levels, also include the legacy doorUtils listing so the API call
  // still works with the existing door hash system.
  const legacyDoorIdMap = useMemo(() => {
    if (config.walldef && config.walldef !== '3DMaze') return new Map<string, string>();
    // Re-derive maze to feed listMazeDoors (only runs for 3DMaze)
    const generator = new MazeGenerator(25, 25, seed);
    const grid = generator.generate();

    if (config.widerRooms) {
      const random = makeSeededRandom(seed ^ 0xdead);
      grid.forEach((row, x) => {
        row.forEach((cell, z) => {
          if (cell.walls.south && z < grid[0].length - 1) {
            if (random() < config.widerRoomFrequency) {
              cell.walls.south = false;
              grid[x][z + 1].walls.north = false;
            }
          }
          if (cell.walls.east && x < grid.length - 1) {
            if (random() < config.widerRoomFrequency) {
              cell.walls.east = false;
              grid[x + 1][z].walls.west = false;
            }
          }
        });
      });
    }

    const doors = listMazeDoors(
      grid, seed, 4, 3,
      config.doorFrequency, config.halfHeightPartitions, config.halfHeightFrequency
    );
    const map = new Map<string, string>();
    for (const door of doors) {
      map.set(`${door.position.x},${door.position.z}`, door.id);
    }
    return map;
  }, [seed, config]);

  const handleDoorCollision = useCallback(
    (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => {
      const key = `${doorPosition.x},${doorPosition.z}`;
      const doorId =
        legacyDoorIdMap.get(key) ??
        doorIdMap.get(key) ??
        `door-unknown-${doorPosition.x}-${doorPosition.z}`;

      const context: DoorCollisionContext = {
        seed,
        playerPosition: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
        cameraRotationY: cameraRotation.y,
        doorId,
      };
      apiDoorCollision(doorPosition, wallNormalAngle, context);
    },
    [seed, playerPosition, cameraRotation, doorIdMap, legacyDoorIdMap]
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const proximityRef = useRef(0);
  proximityRef.current = useMemo(() => {
    let minDistSq = Infinity;
    for (const lp of levelGeometry.lightHints) {
      const dx = playerPosition.x - lp.x;
      const dz = playerPosition.z - lp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) minDistSq = dSq;
    }
    return levelGeometry.lightHints.length > 0
      ? Math.exp(-Math.sqrt(minDistSq) * 0.18)
      : 0;
  }, [playerPosition, levelGeometry.lightHints]);

  const letMeOutOfHere = useCallback(() => {
    const result = Array.from(legacyDoorIdMap.entries()).map(([key, id]) => ({
      game_door_id: id,
      label: key,
    }));
    console.table(result);
    return result;
  }, [legacyDoorIdMap]);

  useEffect(() => {
    (window as any).saveState = saveState;
    (window as any).loadState = loadState;
    (window as any).letThereBeLight = letThereBeLight;
    (window as any).letMeOutOfHere = letMeOutOfHere;
    return () => {
      delete (window as any).saveState;
      delete (window as any).loadState;
      delete (window as any).letThereBeLight;
      delete (window as any).letMeOutOfHere;
    };
  }, [saveState, loadState, letThereBeLight, letMeOutOfHere]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        position: "relative",
        background: "#000",
      }}
    >
      <Canvas
        camera={{
          position: [effectiveInitialPosition.x, effectiveInitialPosition.y, effectiveInitialPosition.z],
          fov: 75,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        {(() => {
          if (!config.shader) return null;
          const ShaderEffect = getShaderComponent(config.shader);
          return ShaderEffect ? <ShaderEffect proximityRef={proximityRef} /> : null;
        })()}
        <ambientLight intensity={config.ambientLight} />
        <Flashlight intensityMultiplier={flashlightIntensity} />
        <CeilingLights level={levelGeometry} />
        <Maze3D
          level={levelGeometry}
          config={config}
          onDoorCollision={handleDoorCollision}
        />
        <FirstPersonController
          level={levelGeometry}
          position={effectiveInitialPosition}
          initialRotation={effectiveInitialRotation}
          onPositionChange={handlePositionChange}
          onRotationChange={handleRotationChange}
          onDoorCollision={handleDoorCollision}
        />
      </Canvas>

      <div
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          color: "white",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          zIndex: 100,
        }}
      >
        <div>Use WASD or arrow keys to move</div>
        <div>Click to enable mouse look</div>
        <button
          onClick={toggleFullscreen}
          style={{
            marginTop: "10px",
            padding: "8px 16px",
            backgroundColor: "#333",
            color: "white",
            border: "1px solid #555",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        </button>
      </div>
    </div>
  );
}
