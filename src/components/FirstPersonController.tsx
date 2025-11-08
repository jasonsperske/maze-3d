import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, Euler, Raycaster, Vector2 } from "three";
import { type MazeCell } from "../utils/mazeGenerator";

interface FirstPersonControllerProps {
  maze: MazeCell[][];
  cellSize: number;
  position: Vector3;
  onPositionChange: (position: Vector3) => void;
  onRotationChange?: (rotation: Euler) => void;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }) => void;
}

export function FirstPersonController({
  maze,
  cellSize,
  position,
  onPositionChange,
  onRotationChange,
  onDoorCollision,
}: FirstPersonControllerProps) {
  const { camera, scene } = useThree();
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
  const rotationState = useRef({
    rotateLeft: false,
    rotateRight: false,
  });
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));
  const levelingState = useRef({
    isLeveling: false,
    levelingSpeed: 2.0, // radians per second
    targetX: 0,
  });

  const moveSpeed = 5;
  const currentPosition = useRef(position.clone());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          moveState.current.forward = true;
          break;
        case "KeyS":
        case "ArrowDown":
          moveState.current.backward = true;
          break;
        case "KeyA":
          moveState.current.left = true;
          break;
        case "KeyD":
          moveState.current.right = true;
          break;
        case "ArrowLeft":
          rotationState.current.rotateLeft = true;
          break;
        case "ArrowRight":
          rotationState.current.rotateRight = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          moveState.current.forward = false;
          break;
        case "KeyS":
        case "ArrowDown":
          moveState.current.backward = false;
          break;
        case "KeyA":
          moveState.current.left = false;
          break;
        case "KeyD":
          moveState.current.right = false;
          break;
        case "ArrowLeft":
          rotationState.current.rotateLeft = false;
          break;
        case "ArrowRight":
          rotationState.current.rotateRight = false;
          break;
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!mouseState.current.isPointerLocked) return;

      euler.current.setFromQuaternion(camera.quaternion);
      euler.current.y -= event.movementX * mouseState.current.sensitivity;
      euler.current.x -= event.movementY * mouseState.current.sensitivity;
      euler.current.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, euler.current.x)
      );
      camera.quaternion.setFromEuler(euler.current);

      if (onRotationChange) {
        onRotationChange(euler.current.clone());
      }
    };

    const handlePointerLockChange = () => {
      const wasPointerLocked = mouseState.current.isPointerLocked;
      mouseState.current.isPointerLocked =
        document.pointerLockElement === document.body;

      // Start leveling when exiting pointer lock
      if (wasPointerLocked && !mouseState.current.isPointerLocked) {
        levelingState.current.isLeveling = true;
        levelingState.current.targetX = 0;
      }
    };

    const handleClick = () => {
      if (!mouseState.current.isPointerLocked) {
        document.body.requestPointerLock();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener(
        "pointerlockchange",
        handlePointerLockChange
      );
      document.removeEventListener("click", handleClick);
    };
  }, [camera]);

  const checkCollision = (newPosition: Vector3): boolean => {
    // Convert world position to maze coordinates
    // Account for the fact that maze cells are centered at (x+0.5)*cellSize, (z+0.5)*cellSize
    const mazeX = Math.floor(newPosition.x / cellSize);
    const mazeZ = Math.floor(newPosition.z / cellSize);

    // Check if outside maze boundaries
    if (
      mazeX < 0 ||
      mazeX >= maze.length ||
      mazeZ < 0 ||
      mazeZ >= maze[0].length
    ) {
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
    // Handle keyboard object detection (? key)
    if ((window as any).pendingDetection) {
      const detectionInfo = (window as any).pendingDetection;
      delete (window as any).pendingDetection;

      // Create raycaster for detection
      const raycaster = new Raycaster();
      const mouse = new Vector2(detectionInfo.x, detectionInfo.y);
      raycaster.setFromCamera(mouse, camera);

      // Get all objects in the scene
      if (scene) {
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
          const clickedObject = intersects[0].object;
          const objectName = clickedObject.constructor.name;
          const objectKey = (clickedObject as any).key || "no-key";
          const userData = clickedObject.userData || {};

          console.log("Object in crosshairs:", {
            name: objectName,
            key: objectKey,
            userData: userData,
            position: clickedObject.position,
            distance: intersects[0].distance,
          });
        } else {
          console.log("No object in crosshairs");
        }
      }
    }

    // Handle keyboard rotation
    const rotationSpeed = 2.0; // radians per second

    // Handle camera leveling when exiting mouse look
    if (levelingState.current.isLeveling) {
      euler.current.setFromQuaternion(camera.quaternion);

      const deltaX = levelingState.current.targetX - euler.current.x;
      const absDeltaX = Math.abs(deltaX);

      // If we're close enough to the target, snap to it and stop leveling
      if (absDeltaX < 0.01) {
        euler.current.x = levelingState.current.targetX;
        levelingState.current.isLeveling = false;
      } else {
        // Move towards the target at a consistent speed
        const direction = Math.sign(deltaX);
        const moveAmount = Math.min(
          absDeltaX,
          levelingState.current.levelingSpeed * delta
        );
        euler.current.x += direction * moveAmount;
      }

      camera.quaternion.setFromEuler(euler.current);

      if (onRotationChange) {
        onRotationChange(euler.current.clone());
      }
    }
    // Handle keyboard rotation (only if not leveling)
    else if (
      rotationState.current.rotateLeft ||
      rotationState.current.rotateRight
    ) {
      euler.current.setFromQuaternion(camera.quaternion);
      if (rotationState.current.rotateLeft) {
        euler.current.y += rotationSpeed * delta;
      }
      if (rotationState.current.rotateRight) {
        euler.current.y -= rotationSpeed * delta;
      }
      camera.quaternion.setFromEuler(euler.current);

      if (onRotationChange) {
        onRotationChange(euler.current.clone());
      }
    }

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
