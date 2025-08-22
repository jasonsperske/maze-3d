import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { SpotLight, Vector3 } from 'three';

export function Flashlight() {
  const spotLightRef = useRef<SpotLight>(null);
  const { camera, gl } = useThree();
  const isPointerLockedRef = useRef(false);

  useEffect(() => {
    const handlePointerLockChange = () => {
      isPointerLockedRef.current = document.pointerLockElement === document.body;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!spotLightRef.current || isPointerLockedRef.current) return;

      // Convert mouse position to normalized device coordinates
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -(event.clientY / window.innerHeight) * 2 + 1;

      // Create a vector from camera to mouse position in world space
      const mouseVector = new Vector3(x, y, 0.5);
      mouseVector.unproject(camera);
      
      // Calculate direction from camera to mouse position
      const direction = mouseVector.sub(camera.position).normalize();
      
      // Position flashlight at camera position
      spotLightRef.current.position.copy(camera.position);
      
      // Point flashlight in the direction of the mouse
      const target = camera.position.clone().add(direction.multiplyScalar(10));
      spotLightRef.current.target.position.copy(target);
      spotLightRef.current.target.updateMatrixWorld();
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
    
    // Always position flashlight at camera position
    spotLightRef.current.position.copy(camera.position);
    
    // When pointer is locked, point flashlight in camera direction
    if (isPointerLockedRef.current) {
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      const target = camera.position.clone().add(direction.multiplyScalar(10));
      spotLightRef.current.target.position.copy(target);
      spotLightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <spotLight
      ref={spotLightRef}
      intensity={50}
      angle={Math.PI / 6}
      penumbra={0.5}
      distance={30}
      decay={2}
      castShadow
      color="#ffffff"
    />
  );
}