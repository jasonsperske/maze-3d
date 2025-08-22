import { useState, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Vector3 } from 'three';
import { MazeGenerator } from './utils/mazeGenerator';
import { Maze3D } from './components/Maze3D';
import { FirstPersonController } from './components/FirstPersonController';
import { Flashlight } from './components/Flashlight';
import { CeilingLights } from './components/CeilingLights';
import { hashCoordinates, callDoorAPI, storeMazeData, loadMazeData, clearMazeData, type StoredMazeData } from './utils/doorUtils';

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Parse seed from URL or load from storage
  const { seed, initialPosition } = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const seedParam = urlParams.get('seed');
    
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
        initialRotation: null
      };
    } else {
      // No seed in URL, check storage
      const storedData = loadMazeData();
      if (storedData) {
        return {
          seed: storedData.seed,
          initialPosition: new Vector3(storedData.position.x, storedData.position.y, storedData.position.z),
          initialRotation: storedData.rotation
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
          initialRotation: null
        };
      }
    }
  }, []);

  const maze = useMemo(() => {
    const generator = new MazeGenerator(25, 25, seed);
    return generator.generate();
  }, [seed]);

  const [playerPosition, setPlayerPosition] = useState(initialPosition);

  const handlePositionChange = useCallback((position: Vector3) => {
    setPlayerPosition(position);
  }, []);

  const handleDoorCollision = useCallback(async (doorPosition: { x: number; y: number; z: number }) => {
    try {
      // Store current state
      const mazeData: StoredMazeData = {
        seed,
        position: { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z },
        rotation: { x: 0, y: 0, z: 0 } // TODO: Get actual camera rotation
      };
      storeMazeData(mazeData);

      // Generate door hash and call API
      const doorHash = hashCoordinates(doorPosition.x, doorPosition.y, doorPosition.z);
      const currentUrl = window.location.href;
      const redirectUrl = await callDoorAPI(currentUrl, seed, doorHash);
      
      // Redirect to new URL
      window.location.href = redirectUrl;
    } catch (error) {
      console.error('Door collision error:', error);
      // Could show a user-friendly error message here
    }
  }, [seed, playerPosition]);

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

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      position: 'relative',
      background: '#000'
    }}>
      <Canvas
        camera={{
          position: [initialPosition.x, initialPosition.y, initialPosition.z],
          fov: 75,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.05} />
        <Flashlight />
        <CeilingLights 
          maze={maze} 
          cellSize={cellSize} 
          wallHeight={wallHeight}
        />
        
        <Maze3D 
          maze={maze} 
          cellSize={cellSize} 
          wallHeight={wallHeight}
          onDoorCollision={handleDoorCollision}
        />
        
        <FirstPersonController
          maze={maze}
          cellSize={cellSize}
          position={playerPosition}
          onPositionChange={handlePositionChange}
          onDoorCollision={handleDoorCollision}
        />
      </Canvas>
      
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        zIndex: 100
      }}>
        <div>Use WASD or arrow keys to move</div>
        <div>Click to enable mouse look</div>
        <button 
          onClick={toggleFullscreen}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        </button>
      </div>
    </div>
  );
}

export default App
