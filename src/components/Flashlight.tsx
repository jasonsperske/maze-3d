import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { SpotLight, Vector3, Quaternion } from 'three';

interface FlashlightProps {
  intensityMultiplier?: number;
}

export function Flashlight({ intensityMultiplier = 1 }: FlashlightProps = {}) {
  const spotLightRef = useRef<SpotLight>(null);
  const { camera, gl } = useThree();
  const isPointerLockedRef = useRef(false);
  const flashlightOffsetRef = useRef(new Vector3(0, 0, -1)); // Offset from camera direction

  useEffect(() => {
    const handlePointerLockChange = () => {
      isPointerLockedRef.current = document.pointerLockElement === document.body;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!spotLightRef.current) return;

      // Only update flashlight offset when pointer is NOT locked
      if (!isPointerLockedRef.current) {
        // Calculate mouse direction relative to camera
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = -(event.clientY / window.innerHeight) * 2 + 1;

        const mouseVector = new Vector3(x, y, 0.5);
        mouseVector.unproject(camera);
        
        const mouseDirection = mouseVector.sub(camera.position).normalize();
        
        // Get camera's forward direction
        const cameraDirection = new Vector3();
        camera.getWorldDirection(cameraDirection);
        
        // Calculate the offset from camera direction to mouse direction
        // This maintains the relative aiming when camera rotates
        const cameraQuaternion = camera.quaternion.clone().invert();
        const localMouseDirection = mouseDirection.clone().applyQuaternion(cameraQuaternion);
        flashlightOffsetRef.current.copy(localMouseDirection);
      }
      // When pointer is locked, no offset needed (flashlight follows camera exactly)
    };

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    gl.domElement.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
    };
  }, [camera, gl]);

  useFrame(() => {
    if (!spotLightRef.current) return;
    
    // Position flashlight slightly below and forward from camera (like being held)
    const positionOffset = new Vector3(0, -0.3, 0.2);
    const flashlightPosition = camera.position.clone().add(positionOffset);
    spotLightRef.current.position.copy(flashlightPosition);
    
    let flashlightDirection: Vector3;
    
    if (isPointerLockedRef.current) {
      // When pointer locked, flashlight follows camera direction exactly
      flashlightDirection = new Vector3();
      camera.getWorldDirection(flashlightDirection);
    } else {
      // When pointer not locked, apply the stored offset to current camera direction
      // This makes the flashlight rotate with the camera but maintain mouse aiming
      flashlightDirection = flashlightOffsetRef.current.clone().applyQuaternion(camera.quaternion);
    }
    
    const target = flashlightPosition.clone().add(flashlightDirection.multiplyScalar(10));
    spotLightRef.current.target.position.copy(target);
    spotLightRef.current.target.updateMatrixWorld();
  });

  return (
    <spotLight
      ref={spotLightRef}
      intensity={50 * intensityMultiplier}
      angle={Math.PI / 6 * Math.max(0.2, Math.min(2, intensityMultiplier))}
      penumbra={0.5}
      distance={30}
      decay={2}
      castShadow
      color="#ffffff"
    />
  );
}