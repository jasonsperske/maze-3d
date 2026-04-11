import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, Euler, Raycaster, Vector2, Box3 } from "three";
import type { LevelGeometry, WallSegment } from "../types/LevelGeometry";

interface FirstPersonControllerProps {
  level: LevelGeometry;
  position: Vector3;
  initialRotation?: Euler;
  onPositionChange: (position: Vector3) => void;
  onRotationChange?: (rotation: Euler) => void;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => void;
}

/** Squared distance from point (px,pz) to segment (ax,az)–(bx,bz). */
function pointToSegmentDistSq(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) {
    const ex = px - ax;
    const ez = pz - az;
    return ex * ex + ez * ez;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + t * dx - px;
  const cz = az + t * dz - pz;
  return cx * cx + cz * cz;
}

const PLAYER_RADIUS = 0.3;
const WALL_HALF_THICKNESS = 0.1;
const COLLISION_DIST = PLAYER_RADIUS + WALL_HALF_THICKNESS;
const COLLISION_DIST_SQ = COLLISION_DIST * COLLISION_DIST;

function checkCollision(newPosition: Vector3, walls: WallSegment[]): boolean {
  const px = newPosition.x;
  const pz = newPosition.z;
  for (const seg of walls) {
    // Door panel segments are collision-free in the opening center —
    // the side frames are separate non-door segments that will block.
    if (seg.isDoor) continue;
    const dSq = pointToSegmentDistSq(px, pz, seg.x1, seg.z1, seg.x2, seg.z2);
    if (dSq < COLLISION_DIST_SQ) return true;
  }
  return false;
}

export function FirstPersonController({
  level,
  position,
  initialRotation,
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
  const euler = useRef(
    initialRotation
      ? new Euler(initialRotation.x, initialRotation.y, initialRotation.z, "YXZ")
      : new Euler(0, 0, 0, "YXZ")
  );
  const levelingState = useRef({
    isLeveling: false,
    levelingSpeed: 2.0,
    targetX: 0,
  });

  const moveSpeed = 5;
  const currentPosition = useRef(position.clone());
  const lastDoorUuid = useRef<string | null>(null);

  useEffect(() => {
    if (initialRotation) {
      camera.quaternion.setFromEuler(euler.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("click", handleClick);
    };
  }, [camera]);

  useFrame((_, delta) => {
    if ((window as any).pendingDetection) {
      const detectionInfo = (window as any).pendingDetection;
      delete (window as any).pendingDetection;

      const raycaster = new Raycaster();
      const mouse = new Vector2(detectionInfo.x, detectionInfo.y);
      raycaster.setFromCamera(mouse, camera);

      if (scene) {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
          const clickedObject = intersects[0].object;
          console.log("Object in crosshairs:", {
            name: clickedObject.constructor.name,
            userData: clickedObject.userData,
            position: clickedObject.position,
            distance: intersects[0].distance,
          });
        } else {
          console.log("No object in crosshairs");
        }
      }
    }

    const rotationSpeed = 2.0;

    if (levelingState.current.isLeveling) {
      euler.current.setFromQuaternion(camera.quaternion);
      const deltaX = levelingState.current.targetX - euler.current.x;
      const absDeltaX = Math.abs(deltaX);
      if (absDeltaX < 0.01) {
        euler.current.x = levelingState.current.targetX;
        levelingState.current.isLeveling = false;
      } else {
        const direction = Math.sign(deltaX);
        const moveAmount = Math.min(absDeltaX, levelingState.current.levelingSpeed * delta);
        euler.current.x += direction * moveAmount;
      }
      camera.quaternion.setFromEuler(euler.current);
      if (onRotationChange) onRotationChange(euler.current.clone());
    } else if (rotationState.current.rotateLeft || rotationState.current.rotateRight) {
      euler.current.setFromQuaternion(camera.quaternion);
      if (rotationState.current.rotateLeft) euler.current.y += rotationSpeed * delta;
      if (rotationState.current.rotateRight) euler.current.y -= rotationSpeed * delta;
      camera.quaternion.setFromEuler(euler.current);
      if (onRotationChange) onRotationChange(euler.current.clone());
    }

    const direction = new Vector3();
    const right = new Vector3();

    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    right.crossVectors(camera.up, direction).normalize();

    const velocity = new Vector3();
    if (moveState.current.forward) velocity.add(direction);
    if (moveState.current.backward) velocity.sub(direction);
    if (moveState.current.left) velocity.add(right);
    if (moveState.current.right) velocity.sub(right);

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(moveSpeed * delta);

      // Door collision detection via scene traversal (works with any mesh geometry)
      const TRIGGER_DEPTH = 1.0;
      let hitDoorUuid: string | null = null;

      scene.traverse((obj) => {
        if (hitDoorUuid || !obj.userData?.isDoor) return;

        const doorWorldPos = new Vector3();
        obj.getWorldPosition(doorWorldPos);

        const size = new Box3().setFromObject(obj).getSize(new Vector3());
        const isEastWestDoor = size.x < size.z;

        const perpDist = isEastWestDoor
          ? Math.abs(camera.position.x - doorWorldPos.x)
          : Math.abs(camera.position.z - doorWorldPos.z);
        const lateralDist = isEastWestDoor
          ? Math.abs(camera.position.z - doorWorldPos.z)
          : Math.abs(camera.position.x - doorWorldPos.x);

        const lateralSpan = obj.userData.lateralSpan ?? 4;
        const movingToward = isEastWestDoor
          ? velocity.x * (doorWorldPos.x - camera.position.x) > 0
          : velocity.z * (doorWorldPos.z - camera.position.z) > 0;

        if (perpDist < TRIGGER_DEPTH && lateralDist < lateralSpan / 2 && movingToward) {
          hitDoorUuid = obj.uuid;
          if (onDoorCollision && lastDoorUuid.current !== obj.uuid) {
            lastDoorUuid.current = obj.uuid;
            const wallNormalAngle = isEastWestDoor
              ? (velocity.x < 0 ? Math.PI / 2 : -Math.PI / 2)
              : (velocity.z < 0 ? 0 : Math.PI);
            onDoorCollision(obj.userData.position, wallNormalAngle);
          }
        }
      });

      if (hitDoorUuid === null) lastDoorUuid.current = null;
      if (hitDoorUuid) return;
    }

    const newPosition = currentPosition.current.clone().add(velocity);

    // Axis-separated collision against wall segments
    const testX = currentPosition.current.clone();
    testX.x = newPosition.x;
    if (!checkCollision(testX, level.walls)) {
      currentPosition.current.x = newPosition.x;
    }

    const testZ = currentPosition.current.clone();
    testZ.z = newPosition.z;
    if (!checkCollision(testZ, level.walls)) {
      currentPosition.current.z = newPosition.z;
    }

    camera.position.copy(currentPosition.current);
    onPositionChange(currentPosition.current);
  });

  return null;
}
