export interface DoorCollisionContext {
  seed: number;
  playerPosition: { x: number; y: number; z: number };
  cameraRotationY: number;
}

export type DoorCollisionHandler = (
  doorPosition: { x: number; y: number; z: number },
  wallNormalAngle: number,
  context: DoorCollisionContext
) => void | Promise<void>;

export function buildReturnUrl(context: DoorCollisionContext): string {
  const state = {
    seed: context.seed,
    position: context.playerPosition,
    rotation: { x: 0, y: context.cameraRotationY + Math.PI, z: 0 },
  };
  return (
    window.location.origin +
    window.location.pathname +
    "?hash=" +
    btoa(JSON.stringify(state))
  );
}
