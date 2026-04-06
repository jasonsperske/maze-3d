import { type DoorCollisionHandler, buildReturnUrl } from "./types";

export const logDoorCollision: DoorCollisionHandler = (
  _doorPosition,
  wallNormalAngle,
  context
) => {
  console.log("Door collision:", {
    wallNormal: wallNormalAngle,
    player: context.playerPosition,
    seed: context.seed,
    referrer: window.location.href,
    returnUrl: buildReturnUrl(context),
  });
};
