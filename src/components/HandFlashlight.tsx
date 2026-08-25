import { Suspense, useEffect, useRef } from "react";
import { XRControllerModel, XRHandModel } from "@react-three/xr";
import { Object3D, SpotLight } from "three";
import { useFlashlightIntensity } from "../hooks/useFlashlightIntensity";

/**
 * The beam itself, aimed down -Z of whatever space its parent provides. Mounted
 * under the right controller so the light goes where the player points it
 * rather than where they happen to be looking.
 */
function FlashlightBeam() {
  const intensityMultiplier = useFlashlightIntensity();
  const targetRef = useRef<Object3D>(null);
  const outerRef = useRef<SpotLight>(null);
  const innerRef = useRef<SpotLight>(null);

  useEffect(() => {
    // A spotLight shines at its `target`, which defaults to a detached Object3D
    // parked at the world origin — leave it alone and the beam points at 0,0,0
    // forever. Re-aim both cones at a child of the hand.
    const target = targetRef.current;
    if (target == null) return;
    if (outerRef.current) outerRef.current.target = target;
    if (innerRef.current) innerRef.current.target = target;
  }, []);

  // Same falloff curve as the desktop flashlight so `letThereBeLight(n)` reads
  // identically in and out of the headset.
  const angleScale = Math.max(0.2, Math.min(2, intensityMultiplier));

  return (
    <>
      <object3D ref={targetRef} position={[0, 0, -10]} />
      <spotLight
        ref={outerRef}
        intensity={50 * intensityMultiplier}
        angle={(Math.PI / 6) * angleScale}
        penumbra={0.5}
        distance={30}
        decay={2}
        castShadow
        color="#ffffff"
      />
      <spotLight
        ref={innerRef}
        intensity={100 * intensityMultiplier}
        angle={(Math.PI / 32) * angleScale}
        penumbra={0.6}
        distance={60}
        decay={1}
        castShadow={false}
        color="#ffffff"
      />
    </>
  );
}

/** Right-hand controller: the usual model, plus the flashlight it's holding. */
export function RightControllerFlashlight() {
  return (
    <>
      {/* The model is fetched from the WebXR input-profiles CDN. It shares a
          Suspense boundary with whatever sits beside it, so a slow (or failed)
          fetch would otherwise take the flashlight down with it — leaving the
          player in a pitch-dark maze holding nothing. Give it its own. */}
      <Suspense fallback={null}>
        <XRControllerModel />
      </Suspense>
      <FlashlightBeam />
    </>
  );
}

/** Same, for headsets running hand tracking instead of controllers. */
export function RightHandFlashlight() {
  return (
    <>
      <Suspense fallback={null}>
        <XRHandModel />
      </Suspense>
      <FlashlightBeam />
    </>
  );
}
