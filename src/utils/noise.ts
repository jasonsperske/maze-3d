// Tileable 2D noise generators. All functions take normalised UV coords in [0,1)
// and return a scalar in [0,1]. They wrap seamlessly so the resulting texture
// tiles without visible seams.

function hash2(seed: number) {
  return (x: number, y: number) => {
    let h = seed | 0;
    h = Math.imul(h ^ x, 374761393);
    h = Math.imul(h ^ y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return ((h >>> 0) / 4294967296);
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Tileable value noise. `period` is the integer grid size that the noise repeats over.
function makeValueNoise(seed: number, period: number) {
  const h = hash2(seed);
  const p = Math.max(1, Math.floor(period));
  return (u: number, v: number): number => {
    const x = u * p;
    const y = v * p;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % p) + p) % p;
    const y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p;
    const y1 = (y0 + 1) % p;
    const a = h(x0, y0);
    const b = h(x1, y0);
    const c = h(x0, y1);
    const d = h(x1, y1);
    const sx = smoothstep(xf);
    const sy = smoothstep(yf);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
}

export function makePerlin(seed: number, scale: number) {
  return makeValueNoise(seed, scale);
}

// Fractal Brownian motion: sum of octaves of value noise, each at double frequency
// and half amplitude. Produces a richer cloudy pattern good for stone/wood.
export function makeFbm(seed: number, scale: number, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) =>
    makeValueNoise(seed + i * 1013, scale * Math.pow(2, i))
  );
  let norm = 0;
  for (let i = 0; i < octaves; i++) norm += Math.pow(0.5, i);
  return (u: number, v: number): number => {
    let sum = 0;
    let amp = 1;
    for (const layer of layers) {
      sum += layer(u, v) * amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

// Tileable Worley / cellular noise. Returns distance to the nearest jittered
// feature point on a `cells x cells` grid wrapped on the torus.
export function makeWorley(seed: number, cells: number) {
  const h = hash2(seed);
  const c = Math.max(1, Math.floor(cells));
  return (u: number, v: number): number => {
    const x = u * c;
    const y = v * c;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let minDistSq = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ((xi + dx) % c + c) % c;
        const cy = ((yi + dy) % c + c) % c;
        const fx = (xi + dx) + h(cx, cy);
        const fy = (yi + dy) + h(cx + 31, cy + 17);
        const ddx = x - fx;
        const ddy = y - fy;
        const d = ddx * ddx + ddy * ddy;
        if (d < minDistSq) minDistSq = d;
      }
    }
    return Math.min(1, Math.sqrt(minDistSq));
  };
}
