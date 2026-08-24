import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";
import { Vector3, Euler, ACESFilmicToneMapping } from "three";
import { MazeGenerator, type MazeCell } from "../utils/mazeGenerator";
import { Maze3D } from "./Maze3D";
import { FirstPersonController } from "./FirstPersonController";
import { Flashlight } from "./Flashlight";
import { RightControllerFlashlight, RightHandFlashlight } from "./HandFlashlight";
import { FlashlightIntensityContext } from "../hooks/useFlashlightIntensity";
import { CeilingLights } from "./CeilingLights";
import { storeMazeData, listMazeDoors } from "../utils/doorUtils";
import { apiDoorCollision } from "../handlers/apiDoorCollision";
import { type DoorCollisionContext } from "../handlers/types";
import { type LevelConfig } from "../types/LevelConfig";
import { getShaderComponent } from "../shaders";
import { type ParsedMap, directionToRotationY } from "../utils/asciiMapParser";
import { placeLights } from "../utils/lightPlacement";
import { applyOpenPlan, type Pillar } from "../utils/openPlan";

interface MazeGameProps {
  config: LevelConfig;
  // Random-mode props (used when mapData is absent):
  level?: string;
  seed?: string;
  // Map-mode props: when set, use a pre-parsed ASCII map and skip generation.
  mapName?: string;
  mapData?: ParsedMap;
}

function seedFromString(s: string): number {
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  // djb2 hash for named seeds like "house"
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Shared seeded random helper (same algorithm used throughout the project)
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

// Rendered only outside a headset: the post-processing composer and the
// head-mounted flashlight both assume a single flat framebuffer under our
// control, which is exactly what WebXR takes away.
const DESKTOP_ONLY = ["immersive-vr", "immersive-ar", "inline"] as const;

export function MazeGame({ config, level, seed: seedProp, mapName, mapData }: MazeGameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Camera rotation lives in a ref, not state: the controller reports it on
  // every mousemove (hundreds/sec on fast mice), and pushing a fresh Euler
  // into state re-rendered the whole component tree per event — visible as
  // stutter while turning. Nothing needs rotation at render time; consumers
  // (saveState, door collisions, ASCII map) read the ref when called.
  const cameraRotationRef = useRef(new Euler(0, 0, 0, "YXZ"));
  const [forceReload, setForceReload] = useState(0);
  const [flashlightIntensity, setFlashlightIntensity] = useState(
    () => config.flashlight ?? 1
  );

  const [vrSupported, setVrSupported] = useState(false);

  // The right hand holds the flashlight; the left keeps its model but drops the
  // pointer rays, since nothing in the maze is clickable.
  const xrStore = useMemo(
    () =>
      createXRStore({
        controller: {
          left: { rayPointer: false, grabPointer: false },
          right: RightControllerFlashlight,
        },
        hand: {
          left: { rayPointer: false, grabPointer: false, touchPointer: false },
          right: RightHandFlashlight,
        },
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      navigator.xr
        ?.isSessionSupported("immersive-vr")
        .then((supported) => {
          if (!cancelled) setVrSupported(supported);
        })
        .catch(() => {});
    };
    check();
    // On localhost the library installs an emulated headset asynchronously;
    // ask again once it lands so the button shows up without a reload.
    const unsubscribe = xrStore.subscribe((state, prev) => {
      if (state.emulator !== prev.emulator) check();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [xrStore]);

  const cellSize = 4;
  const wallHeight = config.wallHeight ?? 3;
  const isMapMode = !!mapData;

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
        // invalid hash param — ignore and fall through
      }
    }

    if (mapData && mapName) {
      const seedValue = seedFromString(mapName);
      const startX = mapData.start.x * cellSize + cellSize / 2;
      const startZ = mapData.start.z * cellSize + cellSize / 2;
      return {
        seed: seedValue,
        initialPosition: new Vector3(startX, 1.7, startZ),
        initialRotation: new Euler(0, directionToRotationY(mapData.start.direction), 0, "YXZ"),
      };
    }

    const seedValue = seedFromString(seedProp ?? "0");
    const generator = new MazeGenerator(25, 25, seedValue);
    generator.generate();
    const start = generator.getStartPosition();
    return {
      seed: seedValue,
      initialPosition: new Vector3(start.x, 1.7, start.z),
      initialRotation: new Euler(0, 0, 0, "YXZ"),
    };
  }, [forceReload, seedProp, mapName, mapData]);

  const { maze, pillars } = useMemo(() => {
    if (mapData) return { maze: mapData.grid, pillars: [] as Pillar[] };

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

    const pillars = config.openPlan
      ? applyOpenPlan(grid, seed ^ 0xb00c, config.openPlan, cellSize)
      : [];

    return { maze: grid, pillars };
  }, [seed, mapData, config.widerRooms, config.widerRoomFrequency, config.openPlan]);

  const [playerPosition, setPlayerPosition] = useState(initialPosition);

  useEffect(() => {
    if (initialRotation) cameraRotationRef.current = initialRotation;
  }, [initialRotation]);

  const handleRotationChange = useCallback((rotation: Euler) => {
    cameraRotationRef.current = rotation;
  }, []);

  const saveState = useCallback(() => {
    const rotation = cameraRotationRef.current;
    const state = {
      seed,
      position: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
    };
    const path = isMapMode
      ? `/map/${mapName}`
      : `/level/${level}/${seedProp}`;
    const url = `${window.location.origin}${path}?hash=${btoa(JSON.stringify(state))}`;
    window.location.href = url;
  }, [seed, playerPosition, level, seedProp, mapName, isMapMode]);

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
      const state = JSON.parse(atob(hashToLoad));
      if (
        state.seed && typeof state.seed === "number" &&
        state.position &&
        typeof state.position.x === "number" &&
        typeof state.position.y === "number" &&
        typeof state.position.z === "number" &&
        state.rotation &&
        typeof state.rotation.x === "number" &&
        typeof state.rotation.y === "number" &&
        typeof state.rotation.z === "number"
      ) {
        setForceReload((prev) => prev + 1);
        return true;
      }
      setForceReload((prev) => prev + 1);
      return false;
    } catch {
      setForceReload((prev) => prev + 1);
      return false;
    }
  }, []);

  const doorIdMap = useMemo(() => {
    const doors = listMazeDoors(
      maze, seed, cellSize, wallHeight,
      config.doorFrequency, config.halfHeightPartitions, config.halfHeightFrequency,
      mapData?.doors
    );
    const map = new Map<string, string>();
    for (const door of doors) {
      map.set(`${door.position.x},${door.position.z}`, door.id);
    }
    return map;
  }, [maze, seed, cellSize, wallHeight, config.doorFrequency, config.halfHeightPartitions, config.halfHeightFrequency, mapData]);

  const handleDoorCollision = useCallback(
    (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => {
      const doorId = doorIdMap.get(`${doorPosition.x},${doorPosition.z}`) ?? `door-unknown-${doorPosition.x}-${doorPosition.z}`;
      const context: DoorCollisionContext = {
        seed,
        playerPosition: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
        cameraRotationY: cameraRotationRef.current.y,
        doorId,
      };
      apiDoorCollision(doorPosition, wallNormalAngle, context);
    },
    [seed, playerPosition, doorIdMap]
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

  // Use the same placement util that CeilingLights uses so proximity tracking
  // (and therefore the flashlight fade) stays in sync with what's drawn.
  const lightFixtures = useMemo(
    () =>
      placeLights(
        maze,
        cellSize,
        wallHeight,
        seed,
        config.lightStyle ?? "ceiling-pendant",
        config.lightSpacing,
        mapData?.lights,
        config.lightGrid
      ),
    [maze, cellSize, wallHeight, seed, config.lightStyle, config.lightSpacing, config.lightGrid, mapData]
  );

  const lightPositions = useMemo(
    () => lightFixtures.map((f) => f.position),
    [lightFixtures]
  );

  // Exponential proximity to nearest light. Recomputed in the per-frame
  // position callback: the controller mutates a single Vector3 in place, so
  // the state reference never changes and any render-time memo keyed on it
  // would go stale after the first frame.
  const proximityRef = useRef(0);
  const handlePositionChange = useCallback(
    (position: Vector3) => {
      setPlayerPosition(position);
      let minDistSq = Infinity;
      for (const lp of lightPositions) {
        const dx = position.x - lp.x;
        const dy = position.y - lp.y;
        const dz = position.z - lp.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < minDistSq) minDistSq = dSq;
      }
      proximityRef.current =
        lightPositions.length > 0 ? Math.exp(-Math.sqrt(minDistSq) * 0.18) : 0;
    },
    [lightPositions]
  );

  const printMazeASCII = useCallback(
    (maze: MazeCell[][]) => {
      let output = "";
      const playerMazeX = Math.floor(playerPosition.x / cellSize);
      const playerMazeZ = Math.floor(playerPosition.z / cellSize);

      const random = makeSeededRandom(seed);
      const doorMap = new Set<string>();
      maze.forEach((row, x) => {
        row.forEach((cell, z) => {
          if (cell.walls.north) {
            if (random() < config.doorFrequency) doorMap.add(`${x},${z},north`);
          }
          if (cell.walls.south) {
            if (random() < config.doorFrequency) doorMap.add(`${x},${z},south`);
          }
          if (cell.walls.east) {
            if (random() < config.doorFrequency) doorMap.add(`${x},${z},east`);
          }
          if (cell.walls.west) {
            if (random() < config.doorFrequency) doorMap.add(`${x},${z},west`);
          }
        });
      });

      const lightMap = new Set<string>();
      for (const f of lightFixtures) {
        lightMap.add(`${f.cell.x},${f.cell.z}`);
      }

      output += "+";
      for (let x = 0; x < maze.length; x++) {
        const hasDoor = doorMap.has(`${x},0,north`) || doorMap.has(`${x},-1,south`);
        output += hasDoor ? "##" : "--";
        output += "+";
      }
      output += "\n";

      for (let z = 0; z < maze[0].length; z++) {
        let rowLine = "";
        let bottomLine = "+";

        for (let x = 0; x < maze.length; x++) {
          const cell = maze[x][z];

          if (cell.walls.west || x === 0) {
            const hasDoor =
              doorMap.has(`${x},${z},west`) ||
              (x > 0 && doorMap.has(`${x - 1},${z},east`));
            rowLine += hasDoor ? "#" : "|";
          } else {
            rowLine += " ";
          }

          if (x === playerMazeX && z === playerMazeZ) {
            const yRotation = cameraRotationRef.current.y;
            const norm = ((yRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            let arrow;
            if (norm < Math.PI / 4 || norm >= (7 * Math.PI) / 4) arrow = "^";
            else if (norm < (3 * Math.PI) / 4) arrow = "<";
            else if (norm < (5 * Math.PI) / 4) arrow = "v";
            else arrow = ">";
            rowLine += " " + "\x1b[91m" + arrow + "\x1b[0m";
          } else if (lightMap.has(`${x},${z}`)) {
            rowLine += " .";
          } else {
            rowLine += "  ";
          }

          if (x === maze.length - 1) {
            rowLine += cell.walls.east
              ? (doorMap.has(`${x},${z},east`) ? "#" : "|")
              : " ";
          }

          if (cell.walls.south || z === maze[0].length - 1) {
            const hasDoor =
              doorMap.has(`${x},${z},south`) ||
              (z < maze[0].length - 1 && doorMap.has(`${x},${z + 1},north`));
            bottomLine += hasDoor ? "##" : "--";
          } else {
            bottomLine += "  ";
          }
          bottomLine += "+";
        }

        output += rowLine + "\n";
        output += bottomLine + "\n";
      }

      console.log(output);
      return "Maze printed to console! (^v<> = your position & direction, # = doors, . = lights)";
    },
    [playerPosition, cellSize, seed, config.doorFrequency, lightFixtures]
  );

  const letMeOutOfHere = useCallback(() => {
    const doors = listMazeDoors(
      maze,
      seed,
      cellSize,
      wallHeight,
      config.doorFrequency,
      config.halfHeightPartitions,
      config.halfHeightFrequency,
      mapData?.doors
    );
    const result = doors.map((d) => ({
      game_door_id: d.id,
      label: `${d.direction} wall, cell (${d.cell.x}, ${d.cell.z})`,
      dest_url: d.dest_url,
    }));
    console.table(result);
    return result;
  }, [maze, seed, cellSize, wallHeight, config.doorFrequency, config.halfHeightPartitions, config.halfHeightFrequency, mapData]);

  useEffect(() => {
    (window as any).secretToEverybody = () => printMazeASCII(maze);
    (window as any).saveState = saveState;
    (window as any).loadState = loadState;
    (window as any).letThereBeLight = letThereBeLight;
    (window as any).letMeOutOfHere = letMeOutOfHere;
    return () => {
      delete (window as any).secretToEverybody;
      delete (window as any).saveState;
      delete (window as any).loadState;
      delete (window as any).letThereBeLight;
      delete (window as any).letMeOutOfHere;
    };
  }, [maze, printMazeASCII, saveState, loadState, letThereBeLight, letMeOutOfHere]);

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
          position: [initialPosition.x, initialPosition.y, initialPosition.z],
          fov: 75,
        }}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <FlashlightIntensityContext.Provider value={flashlightIntensity}>
          <XR store={xrStore}>
            <IfInSessionMode deny={DESKTOP_ONLY}>
              {(() => {
                if (!config.shader) return null;
                const ShaderEffect = getShaderComponent(config.shader);
                return ShaderEffect ? (
                  <ShaderEffect proximityRef={proximityRef} options={config.shaderOptions} />
                ) : null;
              })()}
              <Flashlight intensityMultiplier={flashlightIntensity} />
            </IfInSessionMode>
            {config.fog && (
              <fogExp2 attach="fog" args={[config.fog.color, config.fog.density]} />
            )}
            <ambientLight intensity={config.ambientLight} />
            <CeilingLights
              maze={maze}
              cellSize={cellSize}
              wallHeight={wallHeight}
              seed={seed}
              lightSpacing={config.lightSpacing}
              lightStyle={config.lightStyle ?? "ceiling-pendant"}
              lightGrid={config.lightGrid}
              explicitLights={mapData?.lights}
            />
            <Maze3D
              maze={maze}
              cellSize={cellSize}
              wallHeight={wallHeight}
              seed={seed}
              config={config}
              pillars={pillars}
              explicitDoors={mapData?.doors}
              onDoorCollision={handleDoorCollision}
            />
            <FirstPersonController
              maze={maze}
              cellSize={cellSize}
              pillars={pillars}
              position={playerPosition}
              initialRotation={initialRotation}
              onPositionChange={handlePositionChange}
              onRotationChange={handleRotationChange}
              onDoorCollision={handleDoorCollision}
            />
          </XR>
        </FlashlightIntensityContext.Provider>
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
        {vrSupported && (
          <div>Left stick moves, right stick turns, flashlight in your right hand</div>
        )}
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
        {vrSupported && (
          <button
            onClick={() => xrStore.enterVR()}
            style={{
              marginTop: "10px",
              marginLeft: "10px",
              padding: "8px 16px",
              backgroundColor: "#333",
              color: "white",
              border: "1px solid #555",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Enter VR
          </button>
        )}
      </div>
    </div>
  );
}
