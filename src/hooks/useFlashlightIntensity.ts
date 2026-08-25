import { createContext, useContext } from "react";

/**
 * Flashlight brightness, mirroring MazeGame's `letThereBeLight` state.
 *
 * The XR controller and hand implementations are rendered through a portal that
 * @react-three/xr owns, so they can't be handed props — but React context still
 * crosses the portal, which is how the multiplier reaches the beam.
 */
export const FlashlightIntensityContext = createContext(1);

export function useFlashlightIntensity(): number {
  return useContext(FlashlightIntensityContext);
}
