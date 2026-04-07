import {
  hashCoordinates,
  callDoorAPI,
  storeMazeData,
} from "../utils/doorUtils";
import { type DoorCollisionHandler } from "./types";

export const apiDoorCollision: DoorCollisionHandler = async (
  doorPosition,
  _wallNormalAngle,
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
  const sourceUrl = window.location.origin + window.location.pathname;
  await callDoorAPI(sourceUrl, context.seed, doorHash, context.doorId, {
    position: context.playerPosition,
    rotationY: context.cameraRotationY,
  });
};
