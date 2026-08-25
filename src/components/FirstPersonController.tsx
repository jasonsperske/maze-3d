import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, Euler, Quaternion, Raycaster, Vector2, Box3, type Group } from "three";
import { XROrigin, useXR, useXRInputSourceState } from "@react-three/xr";
import { type MazeCell } from "../utils/mazeGenerator";
import { type Pillar } from "../utils/openPlan";

interface FirstPersonControllerProps {
  maze: MazeCell[][];
  cellSize: number;
  pillars?: Pillar[];
  position: Vector3;
  initialRotation?: Euler;
  onPositionChange: (position: Vector3) => void;
  onRotationChange?: (rotation: Euler) => void;
  onDoorCollision?: (doorPosition: { x: number; y: number; z: number }, wallNormalAngle: number) => void;
}

// Locomotion is deliberately slower in VR than the desktop's 5 m/s: sliding a
// headset through 4m cells at running speed is a reliable way to make someone
// sick.
const XR_MOVE_SPEED = 3;
const XR_TURN_SPEED = 2.0; // radians per second, smooth turn
const THUMBSTICK_DEAD_ZONE = 0.15;
const THUMBSTICK = "xr-standard-thumbstick";
const WORLD_UP = new Vector3(0, 1, 0);

function deadZone(value: number): number {
  if (Math.abs(value) < THUMBSTICK_DEAD_ZONE) return 0;
  // Rescale so the stick ramps from 0 at the edge of the dead zone rather than
  // jumping straight to 0.15 worth of speed.
  const scaled = (Math.abs(value) - THUMBSTICK_DEAD_ZONE) / (1 - THUMBSTICK_DEAD_ZONE);
  return Math.sign(value) * scaled;
}

export function FirstPersonController({
  maze,
  cellSize,
  pillars,
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
    levelingSpeed: 2.0, // radians per second
    targetX: 0,
  });

  const moveSpeed = 5;
  const currentPosition = useRef(position.clone());
  const lastDoorUuid = useRef<string | null>(null);

  // --- WebXR ---------------------------------------------------------------
  // In a session three drives the camera from the headset pose, so moving the
  // camera does nothing. The player is moved by transforming the rig (XROrigin)
  // the XR camera hangs off instead; the head is then wherever the rig plus the
  // player's real-world pose put it.
  const session = useXR((xr) => xr.session);
  const originRef = useRef<Group>(null);
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");
  // Mirrored into a ref so the pointer-lock listeners (bound once) can tell
  // whether a session is running without being torn down and rebuilt.
  const sessionRef = useRef<XRSession | undefined>(undefined);
  const needsRecenter = useRef(false);
  const needsDesktopResync = useRef(false);
  // Last head position known to be out of a wall, so physically walking into
  // one can be undone.
  const lastLegalHead = useRef(new Vector3());
  const xrScratch = useRef({
    headWorld: new Vector3(),
    headQuat: new Quaternion(),
    originQuat: new Quaternion(),
    forward: new Vector3(),
    right: new Vector3(),
    velocity: new Vector3(),
    testPosition: new Vector3(),
  });

  useEffect(() => {
    if (initialRotation) {
      camera.quaternion.setFromEuler(euler.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    if (session != null) {
      // Place the rig on the next frame that carries a real head pose.
      needsRecenter.current = true;
    } else {
      needsDesktopResync.current = true;
    }
  }, [session]);

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
      if (!mouseState.current.isPointerLocked || sessionRef.current != null) return;

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
      // The headset owns the view during a session, and asking for pointer lock
      // from inside one throws a WrongDocumentError.
      if (sessionRef.current != null) return;
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

    // Freestanding open-plan columns (axis-aligned boxes)
    if (pillars) {
      for (const p of pillars) {
        const half = p.size / 2 + buffer;
        if (
          Math.abs(newPosition.x - p.x) < half &&
          Math.abs(newPosition.z - p.z) < half
        ) {
          return true;
        }
      }
    }

    return false;
  };

  // Check for door collision by proximity to each door's wall plane.
  // Uses the scene from useThree() — avoids relying on camera.parent which
  // may be null in R3F (and is the XR rig in a session). Checks perpendicular
  // distance to the wall plane and lateral distance within the corridor so
  // off-center players still trigger. Returns true while the player is inside
  // a door volume, which stops movement.
  const checkDoorCollision = (velocity: Vector3, playerPosition: Vector3): boolean => {
    const TRIGGER_DEPTH = 1.0;
    let hitDoorUuid: string | null = null;

    scene.traverse((obj) => {
      if (hitDoorUuid || !obj.userData?.isDoor) return;

      const doorWorldPos = new Vector3();
      obj.getWorldPosition(doorWorldPos);

      const size = new Box3().setFromObject(obj).getSize(new Vector3());
      const isEastWestDoor = size.x < size.z;

      // perpDist: how close the player is to the wall plane
      // lateralDist: how far off-center the player is along the wall
      const perpDist = isEastWestDoor
        ? Math.abs(playerPosition.x - doorWorldPos.x)
        : Math.abs(playerPosition.z - doorWorldPos.z);
      const lateralDist = isEastWestDoor
        ? Math.abs(playerPosition.z - doorWorldPos.z)
        : Math.abs(playerPosition.x - doorWorldPos.x);

      // Only trigger when moving toward the door, not away from it
      const movingToward = isEastWestDoor
        ? velocity.x * (doorWorldPos.x - playerPosition.x) > 0
        : velocity.z * (doorWorldPos.z - playerPosition.z) > 0;

      if (perpDist < TRIGGER_DEPTH && lateralDist < cellSize / 2 && movingToward) {
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

    if (hitDoorUuid === null) {
      lastDoorUuid.current = null; // Reset when not near any door
    }

    return hitDoorUuid !== null;
  };

  // Turn the rig about the head rather than about its own origin, so the world
  // spins around the player instead of swinging them through an arc whenever
  // they've walked away from where the session started.
  const rotateRigAroundHead = (origin: Group, angle: number, headX: number, headZ: number) => {
    const dx = origin.position.x - headX;
    const dz = origin.position.z - headZ;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    origin.position.x = headX + dx * cos + dz * sin;
    origin.position.z = headZ - dx * sin + dz * cos;
    origin.rotation.y += angle;
    origin.updateMatrixWorld();
  };

  const updateXR = (delta: number, frame: XRFrame | undefined) => {
    const origin = originRef.current;
    // Without an XRFrame the camera still holds last frame's pose (or none at
    // all on the first frame of a session) — nothing worth reacting to.
    if (origin == null || frame == null) return;

    const { headWorld, headQuat, originQuat, forward, right, velocity, testPosition } =
      xrScratch.current;

    // camera.matrix is this frame's head pose in the rig's reference space,
    // but matrixWorld still holds last frame's — compose it by hand off a
    // freshly updated rig.
    origin.updateMatrixWorld();
    origin.getWorldQuaternion(originQuat);
    headQuat.setFromRotationMatrix(camera.matrix).premultiply(originQuat);
    headWorld.setFromMatrixPosition(camera.matrix).applyMatrix4(origin.matrixWorld);

    forward.set(0, 0, -1).applyQuaternion(headQuat);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) {
      // Head pointed straight up or down: fall back to the top of the skull.
      forward.set(0, 1, 0).applyQuaternion(headQuat);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    }
    forward.normalize();
    let yaw = Math.atan2(-forward.x, -forward.z);

    if (needsRecenter.current) {
      // Drop the player where the maze says they start, facing the way it says,
      // by moving the world under them rather than teleporting the headset.
      rotateRigAroundHead(origin, euler.current.y - yaw, headWorld.x, headWorld.z);
      origin.position.x += currentPosition.current.x - headWorld.x;
      origin.position.z += currentPosition.current.z - headWorld.z;
      origin.updateMatrixWorld();
      lastLegalHead.current.set(currentPosition.current.x, 0, currentPosition.current.z);
      needsRecenter.current = false;
      return;
    }

    // Undo any real-world walking that put the head inside a wall. The rig
    // slides so the head lands back where it was last legal — the maze stays
    // solid even for someone with a large play space.
    if (checkCollision(headWorld)) {
      origin.position.x += lastLegalHead.current.x - headWorld.x;
      origin.position.z += lastLegalHead.current.z - headWorld.z;
      origin.updateMatrixWorld();
      headWorld.x = lastLegalHead.current.x;
      headWorld.z = lastLegalHead.current.z;
    }

    // Right stick: yaw only. Its Y axis is deliberately ignored — pitch belongs
    // to the neck, and rolling the horizon is what makes people ill.
    const turnInput = deadZone(rightController?.gamepad[THUMBSTICK]?.xAxis ?? 0);
    if (turnInput !== 0) {
      // Stick right turns right, which is a *negative* rotation about +Y.
      rotateRigAroundHead(origin, -turnInput * XR_TURN_SPEED * delta, headWorld.x, headWorld.z);
      origin.getWorldQuaternion(originQuat);
      headQuat.setFromRotationMatrix(camera.matrix).premultiply(originQuat);
      forward.set(0, 0, -1).applyQuaternion(headQuat);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      yaw = Math.atan2(-forward.x, -forward.z);
    }

    // Left stick: walk and strafe, relative to where the head is looking.
    // Thumbstick Y is negative away from the player, so negate it for forward.
    const strafeInput = deadZone(leftController?.gamepad[THUMBSTICK]?.xAxis ?? 0);
    const walkInput = -deadZone(leftController?.gamepad[THUMBSTICK]?.yAxis ?? 0);

    velocity.set(0, 0, 0);
    if (walkInput !== 0 || strafeInput !== 0) {
      right.crossVectors(forward, WORLD_UP).normalize();
      velocity.addScaledVector(forward, walkInput);
      velocity.addScaledVector(right, strafeInput);
      // Analog sticks give partial speed; a fully deflected diagonal shouldn't
      // outrun a straight sprint.
      if (velocity.lengthSq() > 1) velocity.normalize();
      velocity.multiplyScalar(XR_MOVE_SPEED * delta);

      if (!checkDoorCollision(velocity, headWorld)) {
        testPosition.copy(headWorld);
        testPosition.x += velocity.x;
        if (!checkCollision(testPosition)) {
          origin.position.x += velocity.x;
          headWorld.x = testPosition.x;
        }
        testPosition.copy(headWorld);
        testPosition.z += velocity.z;
        if (!checkCollision(testPosition)) {
          origin.position.z += velocity.z;
          headWorld.z = testPosition.z;
        }
        origin.updateMatrixWorld();
      }
    }

    lastLegalHead.current.x = headWorld.x;
    lastLegalHead.current.z = headWorld.z;

    // Keep the rest of the game (lights, doors, saveState, the ASCII map) on
    // the same footing it has outside XR. Y stays at desktop eye height so a
    // saved link loads the same wherever it was made.
    currentPosition.current.x = headWorld.x;
    currentPosition.current.z = headWorld.z;
    onPositionChange(currentPosition.current);

    euler.current.set(0, yaw, 0);
    if (onRotationChange) {
      // Reused instance: consumers only read it, and a fresh Euler per frame at
      // 90Hz is garbage the headset can't afford.
      onRotationChange(euler.current);
    }
  };

  useFrame((_, delta, frame) => {
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

    if (session != null) {
      updateXR(delta, frame);
      return;
    }

    // Coming back out of a session: the mouse-look euler has been tracking the
    // headset, so hand it to the camera before the desktop path resumes.
    if (needsDesktopResync.current) {
      needsDesktopResync.current = false;
      camera.quaternion.setFromEuler(euler.current);
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

      if (checkDoorCollision(velocity, camera.position)) return; // Stop movement while in door volume
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

  // The rig the XR camera hangs off. Inert outside a session.
  return <XROrigin ref={originRef} />;
}
