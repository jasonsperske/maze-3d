import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Euler, Raycaster } from 'three';
import { type MazeCell } from '../utils/mazeGenerator';

interface FirstPersonControllerProps {
  maze: MazeCell[][];
  cellSize: number;
  position: Vector3;
  onPositionChange: (position: Vector3) => void;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }) => void;
}

export function FirstPersonController({ 
  maze, 
  cellSize, 
  position, 
  onPositionChange,
  onDoorCollision 
}: FirstPersonControllerProps) {
  const { camera } = useThree();
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const mouseState = useRef({
    isPointerLocked: false,
    sensitivity: 0.002,
  });
  const euler = useRef(new Euler(0, 0, 0, 'YXZ'));
  
  const moveSpeed = 5;
  const currentPosition = useRef(position.clone());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = false;
          break;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!mouseState.current.isPointerLocked) return;

      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= event.movementX * mouseState.current.sensitivity;
      euler.current.x -= event.movementY * mouseState.current.sensitivity;
      euler.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    const handlePointerLockChange = () => {
      mouseState.current.isPointerLocked = document.pointerLockElement === document.body;
    };

    const handleClick = () => {
      if (!mouseState.current.isPointerLocked) {
        document.body.requestPointerLock();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('click', handleClick);
    };
  }, [camera]);

  const checkCollision = (newPosition: Vector3): boolean => {
    // Convert world position to maze coordinates
    // Account for the fact that maze cells are centered at (x+0.5)*cellSize, (z+0.5)*cellSize
    const mazeX = Math.floor(newPosition.x / cellSize);
    const mazeZ = Math.floor(newPosition.z / cellSize);
    
    // Check if outside maze boundaries
    if (mazeX < 0 || mazeX >= maze.length || mazeZ < 0 || mazeZ >= maze[0].length) {
      return true;
    }
    
    const cell = maze[mazeX][mazeZ];
    
    // Get local position within the cell (0 to cellSize)
    const localX = newPosition.x - mazeX * cellSize;
    const localZ = newPosition.z - mazeZ * cellSize;
    
    const buffer = 0.3;
    
    // Check collision with walls
    if (cell.walls.north && localZ < buffer) return true;
    if (cell.walls.south && localZ > cellSize - buffer) return true;
    if (cell.walls.west && localX < buffer) return true;
    if (cell.walls.east && localX > cellSize - buffer) return true;
    
    return false;
  };

  useFrame((_, delta) => {
    const direction = new Vector3();
    const right = new Vector3();
    
    // Get camera direction but flatten Y to move on ground plane
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    
    // Calculate right vector
    right.crossVectors(camera.up, direction).normalize();
    
    const velocity = new Vector3();
    
    if (moveState.current.forward) velocity.add(direction);
    if (moveState.current.backward) velocity.sub(direction);
    if (moveState.current.left) velocity.add(right);
    if (moveState.current.right) velocity.sub(right);
    
    // Only normalize if there's movement to avoid NaN
    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(moveSpeed * delta);
      
      // Check for door collision before moving
      const raycaster = new Raycaster();
      const cameraDirection = new Vector3();
      camera.getWorldDirection(cameraDirection);
      raycaster.set(camera.position, cameraDirection);
      
      // Get all objects in the scene
      const scene = camera.parent;
      if (scene) {
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        for (const intersect of intersects) {
          if (intersect.distance < 1.0 && intersect.object.userData?.isDoor) {
            // Found a door collision
            const doorPos = intersect.object.userData.position;
            if (onDoorCollision) {
              onDoorCollision(doorPos);
            }
            return; // Stop movement processing
          }
        }
      }
    }
    
    const newPosition = currentPosition.current.clone().add(velocity);
    
    // Test X movement
    const testPositionX = currentPosition.current.clone();
    testPositionX.x = newPosition.x;
    if (!checkCollision(testPositionX)) {
      currentPosition.current.x = newPosition.x;
    }
    
    // Test Z movement  
    const testPositionZ = currentPosition.current.clone();
    testPositionZ.z = newPosition.z;
    if (!checkCollision(testPositionZ)) {
      currentPosition.current.z = newPosition.z;
    }
    
    camera.position.copy(currentPosition.current);
    onPositionChange(currentPosition.current);
  });

  return null;
}