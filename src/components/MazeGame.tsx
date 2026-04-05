import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Vector3, Euler } from "three";
import { MazeGenerator, type MazeCell } from "../utils/mazeGenerator";
import { Maze3D } from "./Maze3D";
import { FirstPersonController } from "./FirstPersonController";
import { Flashlight } from "./Flashlight";
import { CeilingLights } from "./CeilingLights";
import { loadMazeData, clearMazeData } from "../utils/doorUtils";
import { logDoorCollision } from "../handlers/logDoorCollision";
import { type DoorCollisionContext } from "../handlers/types";
import { type LevelConfig } from "../types/LevelConfig";
import { getShaderComponent } from "../shaders";

interface MazeGameProps {
  config: LevelConfig;
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

export function MazeGame({ config }: MazeGameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraRotation, setCameraRotation] = useState(
    new Euler(0, 0, 0, "YXZ")
  );
  const [forceReload, setForceReload] = useState(0);
  const [flashlightIntensity, setFlashlightIntensity] = useState(1);

  const { seed, initialPosition, initialRotation } = useMemo(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      try {
        const state = JSON.parse(atob(hash));
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
          clearMazeData();
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
        } else {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const seedParam = urlParams.get("seed");

    if (seedParam) {
      clearMazeData();
      const seedValue = parseInt(seedParam, 10);
      const generator = new MazeGenerator(25, 25, seedValue);
      generator.generate();
      const start = generator.getStartPosition();
      return {
        seed: seedValue,
        initialPosition: new Vector3(start.x, 1.7, start.z),
        initialRotation: new Euler(0, 0, 0, "YXZ"),
      };
    }

    const storedData = loadMazeData();
    if (storedData) {
      return {
        seed: storedData.seed,
        initialPosition: new Vector3(
          storedData.position.x,
          storedData.position.y,
          storedData.position.z
        ),
        initialRotation: storedData.rotation
          ? new Euler(storedData.rotation.x, storedData.rotation.y, storedData.rotation.z, "YXZ")
          : new Euler(0, 0, 0, "YXZ"),
      };
    }

    const seedValue = Math.floor(Math.random() * 1000000);
    const generator = new MazeGenerator(25, 25, seedValue);
    generator.generate();
    const start = generator.getStartPosition();
    return {
      seed: seedValue,
      initialPosition: new Vector3(start.x, 1.7, start.z),
      initialRotation: new Euler(0, 0, 0, "YXZ"),
    };
  }, [forceReload]);

  const maze = useMemo(() => {
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

    return grid;
  }, [seed, config.widerRooms, config.widerRoomFrequency]);

  const [playerPosition, setPlayerPosition] = useState(initialPosition);

  useEffect(() => {
    if (initialRotation) setCameraRotation(initialRotation);
  }, [initialRotation]);

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
    return btoa(JSON.stringify(state));
  }, [seed, playerPosition, cameraRotation]);

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
      const hashToLoad = hash || window.location.hash.slice(1);
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
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setForceReload((prev) => prev + 1);
      return false;
    } catch {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setForceReload((prev) => prev + 1);
      return false;
    }
  }, []);

  const handleDoorCollision = useCallback(
    (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => {
      const context: DoorCollisionContext = {
        seed,
        playerPosition: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
        cameraRotationY: cameraRotation.y,
      };
      logDoorCollision(doorPosition, wallNormalAngle, context);
    },
    [seed, playerPosition, cameraRotation]
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

  const cellSize = 4;
  const wallHeight = 3;

  // Mirror CeilingLights' deterministic placement to know where lights are in world space.
  const lightPositions = useMemo(() => {
    const positions: Array<{ x: number; y: number; z: number }> = [];
    const random = makeSeededRandom(seed);
    for (let x = 0; x < maze.length; x += config.lightSpacing + Math.floor(random() * 5)) {
      for (let z = 0; z < maze[0].length; z += config.lightSpacing + Math.floor(random() * 5)) {
        if (x >= maze.length || z >= maze[0].length) continue;
        if (Object.values(maze[x][z].walls).filter(Boolean).length >= 3) continue;
        positions.push({
          x: x * cellSize + cellSize / 2,
          y: wallHeight - 0.3,
          z: z * cellSize + cellSize / 2,
        });
      }
    }
    return positions;
  }, [maze, seed, config.lightSpacing, cellSize, wallHeight]);

  // Exponential proximity to nearest light — updated every render since playerPosition is state.
  const proximityRef = useRef(0);
  proximityRef.current = useMemo(() => {
    let minDistSq = Infinity;
    for (const lp of lightPositions) {
      const dx = playerPosition.x - lp.x;
      const dy = playerPosition.y - lp.y;
      const dz = playerPosition.z - lp.z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < minDistSq) minDistSq = dSq;
    }
    return lightPositions.length > 0 ? Math.exp(-Math.sqrt(minDistSq) * 0.18) : 0;
  }, [playerPosition, lightPositions]);

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
      const lightRandom = makeSeededRandom(seed);
      for (let x = 0; x < maze.length; x += config.lightSpacing + Math.floor(lightRandom() * 5)) {
        for (let z = 0; z < maze[0].length; z += config.lightSpacing + Math.floor(lightRandom() * 5)) {
          if (x >= maze.length || z >= maze[0].length) continue;
          const cell = maze[x][z];
          if (Object.values(cell.walls).filter(Boolean).length >= 3) continue;
          lightMap.add(`${x},${z}`);
        }
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
            const yRotation = cameraRotation.y;
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
    [playerPosition, cellSize, seed, cameraRotation.y, config.doorFrequency, config.lightSpacing]
  );

  useEffect(() => {
    const handleHashChange = () => setForceReload((prev) => prev + 1);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    (window as any).secretToEverybody = () => printMazeASCII(maze);
    (window as any).saveState = saveState;
    (window as any).loadState = loadState;
    (window as any).letThereBeLight = letThereBeLight;
    return () => {
      delete (window as any).secretToEverybody;
      delete (window as any).saveState;
      delete (window as any).loadState;
      delete (window as any).letThereBeLight;
    };
  }, [maze, printMazeASCII, saveState, loadState, letThereBeLight]);

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
        style={{ width: "100%", height: "100%" }}
      >
        {(() => {
          if (!config.shader) return null;
          const ShaderEffect = getShaderComponent(config.shader);
          return ShaderEffect ? <ShaderEffect proximityRef={proximityRef} /> : null;
        })()}
        <ambientLight intensity={config.ambientLight} />
        <Flashlight intensityMultiplier={flashlightIntensity} />
        <CeilingLights
          maze={maze}
          cellSize={cellSize}
          wallHeight={wallHeight}
          seed={seed}
          lightSpacing={config.lightSpacing}
        />
        <Maze3D
          maze={maze}
          cellSize={cellSize}
          wallHeight={wallHeight}
          seed={seed}
          config={config}
          onDoorCollision={handleDoorCollision}
        />
        <FirstPersonController
          maze={maze}
          cellSize={cellSize}
          position={playerPosition}
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
