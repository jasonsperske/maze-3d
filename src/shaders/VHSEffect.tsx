import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const vhsShader = {
  uniforms: {
    tDiffuse:   { value: null },
    time:       { value: 0 },
    distortion: { value: 0.1 }, // 0 = calm, 1 = fully distorted
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float distortion;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Rolling horizontal warp — scales with distortion
      float warp = (sin(uv.y * 8.0  + time * 1.2) * 0.0015
                  + sin(uv.y * 23.0 - time * 0.7) * 0.0008) * distortion;
      uv.x += warp;

      // Occasional hard horizontal tear — only visible at high distortion
      float tearY = mod(time * 0.3, 1.0);
      if (abs(uv.y - tearY) < 0.002) {
        uv.x += sin(time * 10.0) * 0.02 * distortion;
      }

      // Chromatic aberration — channels drift apart with distortion
      float ca = (0.0025 + sin(time * 0.5) * 0.001) * distortion;
      float r = texture2D(tDiffuse, vec2(uv.x + ca, uv.y)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, vec2(uv.x - ca, uv.y)).b;
      vec3 color = vec3(r, g, b);

      // Scanlines — always present, independent of distortion
      color -= sin(vUv.y * 600.0) * 0.03;

      // Static noise — scales with distortion
      color += rand(vUv + fract(time * 0.07)) * 0.06 * distortion;

      // Vignette — always present
      vec2 vc = vUv * (1.0 - vUv.yx);
      color *= pow(vc.x * vc.y * 12.0, 0.35);

      // Warm desaturation (magnetic tape colour bleed) — always present
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 0.8);
      color.r *= 1.08;
      color.g *= 0.98;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

interface VHSEffectProps {
  proximityRef: MutableRefObject<number>;
}

export function VHSEffect({ proximityRef }: VHSEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const vhsPassRef = useRef<ShaderPass | null>(null);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const pass = new ShaderPass(vhsShader);
    pass.renderToScreen = true;
    c.addPass(pass);
    vhsPassRef.current = pass;
    return c;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size]);

  useEffect(() => {
    return () => composer.dispose();
  }, [composer]);

  useFrame((_, delta) => {
    const pass = vhsPassRef.current;
    if (!pass) return;

    pass.uniforms.time.value += delta;
    // proximityRef is updated each frame by MazeGame from deterministic light positions
    pass.uniforms.distortion.value = 0.08 + proximityRef.current * 0.92;

    composer.render();
  }, 1);

  return null;
}
