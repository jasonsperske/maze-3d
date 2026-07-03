import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// Found-footage film grade: animated grain that lives in the shadows, a heavy
// lens vignette, edge chromatic aberration and a sickly green-grey cast.
// Unlike the VHS shader there is no warping or scanlines — the image stays
// sharp and steady, it just looks like it was shot on a bad camera in a
// building with history.
const filmShader = {
  uniforms: {
    tDiffuse:    { value: null },
    time:        { value: 0 },
    grainAmount: { value: 0.12 },
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
    uniform float grainAmount;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic aberration that grows toward the frame edges
      vec2 off = uv - 0.5;
      vec2 ca = off * dot(off, off) * 0.02;
      float r = texture2D(tDiffuse, uv - ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + ca).b;
      vec3 color = vec3(r, g, b);

      float luma = dot(color, vec3(0.299, 0.587, 0.114));

      // Grade: desaturate, pull toward green-grey, lift blacks so shadow
      // detail (and grain) stays barely visible instead of clipping to 0.
      color = mix(vec3(luma), color, 0.72);
      color *= vec3(0.94, 1.0, 0.9);
      color += vec3(0.012, 0.014, 0.011);

      // Film grain — regenerated every frame, strongest in the shadows
      float n = rand(vUv * 1.37 + fract(time * 61.7));
      color += (n - 0.5) * grainAmount * (1.0 - luma);

      // Heavy lens vignette
      vec2 vc = vUv * (1.0 - vUv.yx);
      color *= clamp(pow(vc.x * vc.y * 20.0, 0.45), 0.0, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

interface FilmEffectProps {
  proximityRef: MutableRefObject<number>;
}

export function FilmEffect({ proximityRef }: FilmEffectProps) {
  const { gl, scene, camera, size } = useThree();
  const passRef = useRef<ShaderPass | null>(null);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const pass = new ShaderPass(filmShader);
    pass.renderToScreen = true;
    c.addPass(pass);
    passRef.current = pass;
    return c;
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size]);

  useEffect(() => {
    return () => composer.dispose();
  }, [composer]);

  useFrame((_, delta) => {
    const pass = passRef.current;
    if (!pass) return;

    pass.uniforms.time.value += delta;
    // Grain thickens away from light sources — the camera "gains up" in the dark.
    pass.uniforms.grainAmount.value = 0.08 + (1 - proximityRef.current) * 0.08;

    composer.render();
  }, 1);

  return null;
}
