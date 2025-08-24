import { useState, useMemo, useCallback, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Vector3, Euler } from "three";
import { MazeGenerator } from "./utils/mazeGenerator";
import { Maze3D } from "./components/Maze3D";
import { FirstPersonController } from "./components/FirstPersonController";
import { Flashlight } from "./components/Flashlight";
import { CeilingLights } from "./components/CeilingLights";
import {
  hashCoordinates,
  callDoorAPI,
  storeMazeData,
  loadMazeData,
  clearMazeData,
  type StoredMazeData,
} from "./utils/doorUtils";
import { type MazeCell } from "./utils/mazeGenerator";

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraRotation, setCameraRotation] = useState(
    new Euler(0, 0, 0, "YXZ")
  );
  const [forceReload, setForceReload] = useState(0);
  const [flashlightIntensity, setFlashlightIntensity] = useState(1);

  // Parse seed from URL, hash, or load from storage
  const { seed, initialPosition, initialRotation } = useMemo(() => {
    // First check hash for state
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) {
      try {
        const state = JSON.parse(atob(hash));
        // Validate hash structure
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
          console.error("Invalid hash state structure:", state);
          // Clear invalid hash and fallback
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search
          );
        }
      } catch (e) {
        console.error("Failed to parse hash state:", e, "Hash:", hash);
        // Clear invalid hash and fallback
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const seedParam = urlParams.get("seed");

    if (seedParam) {
      // URL has seed, use it and clear any stored data
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
    } else {
      // No seed in URL, check storage
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
            ? new Euler(
                storedData.rotation.x,
                storedData.rotation.y,
                storedData.rotation.z,
                "YXZ"
              )
            : new Euler(0, 0, 0, "YXZ"),
        };
      } else {
        // No stored data, generate random
        const seedValue = Math.floor(Math.random() * 1000000);
        const generator = new MazeGenerator(25, 25, seedValue);
        generator.generate();
        const start = generator.getStartPosition();
        return {
          seed: seedValue,
          initialPosition: new Vector3(start.x, 1.7, start.z),
          initialRotation: new Euler(0, 0, 0, "YXZ"),
        };
      }
    }
  }, [forceReload]);

  const maze = useMemo(() => {
    const generator = new MazeGenerator(25, 25, seed);
    return generator.generate();
  }, [seed]);

  const [playerPosition, setPlayerPosition] = useState(initialPosition);

  // Initialize camera rotation from loaded state
  useEffect(() => {
    if (initialRotation) {
      setCameraRotation(initialRotation);
    }
  }, [initialRotation]);

  const handlePositionChange = useCallback((position: Vector3) => {
    setPlayerPosition(position);
  }, []);

  const handleRotationChange = useCallback((rotation: Euler) => {
    setCameraRotation(rotation);
  }, []);

  // Save state functions
  const saveState = useCallback(() => {
    const state = {
      seed,
      position: {
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
      },
      rotation: {
        x: cameraRotation.x,
        y: cameraRotation.y,
        z: cameraRotation.z,
      },
    };
    const hash = btoa(JSON.stringify(state));
    return hash;
  }, [seed, playerPosition, cameraRotation]);

  const letThereBeLight = useCallback((factor: number = 1) => {
    setFlashlightIntensity(factor);
    return `Flashlight intensity set to ${factor}x`;
  }, []);

  // Keyboard handler for object detection
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        // Get mouse position for raycasting (center of screen)
        const x = 0; // Center of screen
        const y = 0; // Center of screen

        // Store detection request for the FirstPersonController to handle
        (window as any).pendingDetection = { x, y };
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const loadState = useCallback((hash?: string) => {
    try {
      const hashToLoad = hash || window.location.hash.slice(1);
      if (!hashToLoad) return false;

      const state = JSON.parse(atob(hashToLoad));
      // Validate hash structure
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
        // Force reload with new state
        setForceReload((prev) => prev + 1);
        return true;
      } else {
        console.error("Invalid hash state structure:", state);
        // Clear invalid hash and fallback to random
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
        setForceReload((prev) => prev + 1);
        return false;
      }
    } catch (e) {
      console.error("Failed to load state:", e, "Hash:", hashToLoad);
      // Clear invalid hash and fallback to random
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      setForceReload((prev) => prev + 1);
      return false;
    }
  }, []);

  const handleDoorCollision = useCallback(
    async (doorPosition: { x: number; y: number; z: number }) => {
      try {
        // Store current state
        const mazeData: StoredMazeData = {
          seed,
          position: {
            x: playerPosition.x,
            y: playerPosition.y,
            z: playerPosition.z,
          },
          rotation: { x: 0, y: 0, z: 0 }, // TODO: Get actual camera rotation
        };
        storeMazeData(mazeData);

        // Generate door hash and call API
        const doorHash = hashCoordinates(
          doorPosition.x,
          doorPosition.y,
          doorPosition.z
        );
        const currentUrl = window.location.href;
        const redirectUrl = await callDoorAPI(currentUrl, seed, doorHash);

        // Redirect to new URL
        window.location.href = redirectUrl;
      } catch (error) {
        console.error("Door collision error:", error);
        // Could show a user-friendly error message here
      }
    },
    [seed, playerPosition]
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

  // Create ASCII maze function and expose it globally
  const printMazeASCII = useCallback(
    (maze: MazeCell[][]) => {
      let output = "";

      // Calculate player position in maze coordinates
      const playerMazeX = Math.floor(playerPosition.x / cellSize);
      const playerMazeZ = Math.floor(playerPosition.z / cellSize);

      // Create seeded random for door placement (exact same logic as in Maze3D.tsx)
      const seededRandom = (seed: number): (() => number) => {
        let m_z = 987654321;
        let m_w = 123456789;
        const mask = 0xffffffff;

        m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
        m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;

        return function () {
          m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
          m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
          let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
          result /= 4294967296;
          return result;
        };
      };

      const random = seededRandom(seed); // Same seed as in Maze3D.tsx

      // Build door map - must follow exact same iteration order as Maze3D.tsx
      const doorMap = new Set<string>();
      maze.forEach((row, x) => {
        row.forEach((cell, z) => {
          // North wall (must be first to match Maze3D.tsx order)
          if (cell.walls.north) {
            const hasDoor = random() < 0.1;
            if (hasDoor) doorMap.add(`${x},${z},north`);
          }

          // South wall
          if (cell.walls.south) {
            const hasDoor = random() < 0.1;
            if (hasDoor) doorMap.add(`${x},${z},south`);
          }

          // East wall
          if (cell.walls.east) {
            const hasDoor = random() < 0.1;
            if (hasDoor) doorMap.add(`${x},${z},east`);
          }

          // West wall
          if (cell.walls.west) {
            const hasDoor = random() < 0.1;
            if (hasDoor) doorMap.add(`${x},${z},west`);
          }
        });
      });

      // Build light map - using same logic as CeilingLights.tsx but with same seed as doors
      const lightMap = new Set<string>();
      const lightRandom = seededRandom(seed); // Use same seed as doors and walls

      for (let x = 0; x < maze.length; x += 8 + Math.floor(lightRandom() * 5)) {
        for (
          let z = 0;
          z < maze[0].length;
          z += 8 + Math.floor(lightRandom() * 5)
        ) {
          if (x >= maze.length || z >= maze[0].length) continue;

          const cell = maze[x][z];
          const wallCount = Object.values(cell.walls).filter(Boolean).length;
          if (wallCount >= 3) continue; // Skip very enclosed areas

          lightMap.add(`${x},${z}`);
        }
      }

      // Top border
      output += "+";
      for (let x = 0; x < maze.length; x++) {
        const hasDoor =
          doorMap.has(`${x},0,north`) || doorMap.has(`${x},-1,south`);
        output += hasDoor ? "##" : "--";
        output += "+";
      }
      output += "\n";

      // Maze rows
      for (let z = 0; z < maze[0].length; z++) {
        // Vertical walls and cells
        let rowLine = "";
        let bottomLine = "+";

        for (let x = 0; x < maze.length; x++) {
          const cell = maze[x][z];

          // Left wall
          if (cell.walls.west || x === 0) {
            const hasDoor =
              doorMap.has(`${x},${z},west`) ||
              (x > 0 && doorMap.has(`${x - 1},${z},east`));
            rowLine += hasDoor ? "#" : "|";
          } else {
            rowLine += " ";
          }

          // Cell content - show player position with directional arrow, light, or empty space
          if (x === playerMazeX && z === playerMazeZ) {
            // Convert rotation to direction arrow
            // cameraRotation.y is the Y-axis rotation (left/right turning)
            const yRotation = cameraRotation.y;

            // Normalize rotation to 0-2π range
            const normalizedRotation =
              ((yRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

            // Determine direction based on rotation
            // 0 = North (^), π/2 = East (>), π = South (v), 3π/2 = West (<)
            let directionArrow;
            if (
              normalizedRotation < Math.PI / 4 ||
              normalizedRotation >= (7 * Math.PI) / 4
            ) {
              directionArrow = "^"; // North
            } else if (
              normalizedRotation >= Math.PI / 4 &&
              normalizedRotation < (3 * Math.PI) / 4
            ) {
              directionArrow = "<"; // East
            } else if (
              normalizedRotation >= (3 * Math.PI) / 4 &&
              normalizedRotation < (5 * Math.PI) / 4
            ) {
              directionArrow = "v"; // South
            } else {
              directionArrow = ">"; // West
            }

            rowLine += " " + "\x1b[91m" + directionArrow + "\x1b[0m"; // Bright red arrow
          } else if (lightMap.has(`${x},${z}`)) {
            rowLine += " ."; // Light marker
          } else {
            rowLine += "  ";
          }

          // Right wall (only for last column)
          if (x === maze.length - 1) {
            if (cell.walls.east) {
              const hasDoor = doorMap.has(`${x},${z},east`);
              rowLine += hasDoor ? "#" : "|";
            } else {
              rowLine += " ";
            }
          }

          // Bottom wall
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
    [playerPosition, cellSize, seed, cameraRotation.y]
  );

  // Hash change handler
  useEffect(() => {
    const handleHashChange = () => {
      // Force reload with new state
      setForceReload((prev) => prev + 1);
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []); // Remove loadState dependency

  // Expose functions globally
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
        <ambientLight intensity={0.05} />
        <Flashlight intensityMultiplier={flashlightIntensity} />
        <CeilingLights
          maze={maze}
          cellSize={cellSize}
          wallHeight={wallHeight}
          seed={seed}
        />

        <Maze3D
          maze={maze}
          cellSize={cellSize}
          wallHeight={wallHeight}
          seed={seed}
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

export default App;
