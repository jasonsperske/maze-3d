import * as THREE from "three";
import type {
  TextureSpec,
  ImageTextureSpec,
  NoiseTextureSpec,
  LayeredNoiseTextureSpec,
  GridTextureSpec,
  NormalMapSpec,
  NormalNoiseTextureSpec,
  NoiseScale,
} from "../types/LevelConfig";
import { makePerlin, makeFbm, makeWorley } from "./noise";

const DEFAULT_NOISE_SIZE = 256;
const DEFAULT_SVG_SIZE = 512;
const DEFAULT_NOISE_SCALE = 4;

type NoiseAlgorithm = "perlin" | "fbm" | "worley";

function makeSampler(algorithm: NoiseAlgorithm, seed: number, scale: NoiseScale) {
  const [sx, sy] = Array.isArray(scale) ? scale : [scale, scale];
  if (algorithm === "perlin") return makePerlin(seed, sx, sy);
  if (algorithm === "fbm") return makeFbm(seed, sx, sy);
  // Worley is isotropic — anisotropic cells would need jitter-space warping.
  return makeWorley(seed, sx);
}

export async function loadTextureFromSpec(spec: TextureSpec): Promise<THREE.Texture> {
  let tex: THREE.Texture;
  if (spec.type === "image") tex = await loadImageTexture(spec);
  else if (spec.type === "noise") tex = generateNoiseTexture(spec);
  else if (spec.type === "grid") tex = generateGridTexture(spec);
  else tex = generateLayeredNoiseTexture(spec);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Normal maps are linear data, not colour — they must NOT be sRGB-decoded by
// the GPU or the lighting will be wrong. Generate synchronously since we only
// support noise-based normals.
export function loadNormalMapFromSpec(spec: NormalMapSpec): THREE.Texture {
  const tex = generateNormalMapTexture(spec);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

async function loadImageTexture(spec: ImageTextureSpec): Promise<THREE.Texture> {
  const isSvg = spec.url.toLowerCase().endsWith(".svg");
  if (!isSvg) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(spec.url, resolve, undefined, (e) =>
        reject(new Error(`Failed to load texture ${spec.url}: ${String(e)}`))
      );
    });
  }
  // SVGs aren't supported by TextureLoader directly; rasterise via canvas.
  const size = spec.size ?? DEFAULT_SVG_SIZE;
  const img = await loadHtmlImage(spec.url);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${url}`));
    img.src = url;
  });
}

function generateNoiseTexture(spec: NoiseTextureSpec): THREE.Texture {
  const size = spec.size ?? DEFAULT_NOISE_SIZE;
  const scale = spec.scale ?? DEFAULT_NOISE_SCALE;
  const seed = spec.seed ?? 1;
  const colors = spec.colors ?? ["#000000", "#ffffff"];

  const sample = makeSampler(spec.algorithm, seed, scale);

  const c0 = hexToRgb(colors[0]);
  const c1 = hexToRgb(colors[1]);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const t = Math.max(0, Math.min(1, sample(u, v)));
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(c0.r + (c1.r - c0.r) * t);
      data[idx + 1] = Math.round(c0.g + (c1.g - c0.g) * t);
      data[idx + 2] = Math.round(c0.b + (c1.b - c0.b) * t);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function generateLayeredNoiseTexture(spec: LayeredNoiseTextureSpec): THREE.Texture {
  const size = spec.size ?? DEFAULT_NOISE_SIZE;
  const base = hexToRgb(spec.baseColor);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < size * size; i++) {
    data[i * 4] = base.r;
    data[i * 4 + 1] = base.g;
    data[i * 4 + 2] = base.b;
    data[i * 4 + 3] = 255;
  }

  for (const layer of spec.layers) {
    const sample = makeSampler(layer.algorithm, layer.seed ?? 1, layer.scale);
    const opacity = layer.opacity ?? 1;
    const blend = layer.blend ?? "multiply";
    const color = hexToRgb(layer.color);
    const fade = layer.verticalFade;

    for (let y = 0; y < size; y++) {
      // Canvas row 0 is the top of the texture; with the default flipY that is
      // also the top of a wall, so verticalFade reads [top, bottom].
      const fadeMul = fade
        ? fade[0] + (fade[1] - fade[0]) * (y / (size - 1))
        : 1;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const t = Math.max(0, Math.min(1, sample(u, v))) * opacity * fadeMul;
        if (t <= 0) continue;
        const idx = (y * size + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const blended = blendPixel(blend, r, g, b, color.r, color.g, color.b);
        data[idx] = clamp255(r + (blended.r - r) * t);
        data[idx + 1] = clamp255(g + (blended.g - g) * t);
        data[idx + 2] = clamp255(b + (blended.b - b) * t);
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function generateGridTexture(spec: GridTextureSpec): THREE.Texture {
  const size = spec.size ?? 512;
  const cells = Math.max(1, spec.cells ?? 4);
  const cellsX = Math.max(0, spec.cellsX ?? cells);
  const cellsY = Math.max(0, spec.cellsY ?? cells);
  const lineWidth = spec.lineWidth ?? 2;
  const base = hexToRgb(spec.baseColor);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = spec.baseColor;
  ctx.fillRect(0, 0, size, size);

  // Optional fbm mottling so the tiles read as aged fibre, not flat vector fill
  if (spec.mottle && spec.mottle > 0) {
    const mottleColor = hexToRgb(
      spec.mottleColor ??
        `#${[base.r, base.g, base.b]
          .map((c) => Math.round(c * 0.8).toString(16).padStart(2, "0"))
          .join("")}`
    );
    const [mx, my] = Array.isArray(spec.mottleScale)
      ? spec.mottleScale
      : [spec.mottleScale ?? cells * 2, spec.mottleScale ?? cells * 2];
    const sample = makeFbm(spec.seed ?? 1, mx, my);
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = Math.max(0, Math.min(1, sample(x / size, y / size))) * spec.mottle;
        const idx = (y * size + x) * 4;
        data[idx] = clamp255(data[idx] + (mottleColor.r - data[idx]) * t);
        data[idx + 1] = clamp255(data[idx + 1] + (mottleColor.g - data[idx + 1]) * t);
        data[idx + 2] = clamp255(data[idx + 2] + (mottleColor.b - data[idx + 2]) * t);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Grid lines drawn at the leading edge of each cell only, so the pattern
  // tiles without doubled lines at the seam.
  ctx.fillStyle = spec.lineColor;
  for (let i = 0; i < cellsX; i++) {
    const p = Math.round((i * size) / cellsX);
    ctx.fillRect(p, 0, lineWidth, size);
  }
  for (let i = 0; i < cellsY; i++) {
    const p = Math.round((i * size) / cellsY);
    ctx.fillRect(0, p, size, lineWidth);
  }

  return new THREE.CanvasTexture(canvas);
}

function generateNormalMapTexture(spec: NormalNoiseTextureSpec): THREE.Texture {
  const size = spec.size ?? DEFAULT_NOISE_SIZE;
  const scale = spec.scale ?? DEFAULT_NOISE_SCALE;
  const seed = spec.seed ?? 1;
  const strength = spec.strength ?? 2;

  const sample = makeSampler(spec.algorithm, seed, scale);

  // Pre-compute the height field so we can sample neighbours via wrap-around
  // for tileable Sobel gradients.
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] = Math.max(0, Math.min(1, sample(u, v)));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let y = 0; y < size; y++) {
    const yU = (y - 1 + size) % size;
    const yD = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xL = (x - 1 + size) % size;
      const xR = (x + 1) % size;
      const dx = (height[y * size + xR] - height[y * size + xL]) * strength;
      const dy = (height[yD * size + x] - height[yU * size + x]) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx / len) * 0.5 * 255 + 127.5);
      data[idx + 1] = Math.round((ny / len) * 0.5 * 255 + 127.5);
      data[idx + 2] = Math.round((nz / len) * 0.5 * 255 + 127.5);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function blendPixel(
  mode: "multiply" | "overlay" | "screen",
  r: number, g: number, b: number,
  cr: number, cg: number, cb: number
): { r: number; g: number; b: number } {
  if (mode === "multiply") {
    return { r: (r * cr) / 255, g: (g * cg) / 255, b: (b * cb) / 255 };
  }
  if (mode === "screen") {
    return {
      r: 255 - ((255 - r) * (255 - cr)) / 255,
      g: 255 - ((255 - g) * (255 - cg)) / 255,
      b: 255 - ((255 - b) * (255 - cb)) / 255,
    };
  }
  // overlay
  return { r: overlay(r, cr), g: overlay(g, cg), b: overlay(b, cb) };
}

function overlay(a: number, b: number): number {
  return a < 128
    ? (2 * a * b) / 255
    : 255 - (2 * (255 - a) * (255 - b)) / 255;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { r: 128, g: 128, b: 128 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function getTileSize(spec: { tileSize?: number } | undefined, fallback: number): number {
  return spec?.tileSize ?? fallback;
}
