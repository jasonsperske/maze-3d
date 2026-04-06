import {
  hashCoordinates,
  callDoorAPI,
  storeMazeData,
} from "../utils/doorUtils";
import { type DoorCollisionHandler } from "./types";

export const apiDoorCollision: DoorCollisionHandler = async (
  doorPosition,
  wallNormalAngle,
  context
) => {
  storeMazeData({
    seed: context.seed,
    position: context.playerPosition,
    rotation: { x: 0, y: context.cameraRotationY, z: 0 },
  });

  const doorHash = hashCoordinates(
    doorPosition.x,
    doorPosition.y,
    doorPosition.z
  );
  await callDoorAPI(window.location.href, context.seed, doorHash, {
    position: context.playerPosition,
    rotationY: context.cameraRotationY,
  });
};
