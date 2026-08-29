// Standalone headsets run a phone-class tiled GPU at two eyes' worth of pixels,
// so the wall/floor/ceiling surfaces — big, always on screen, textured, normal
// mapped, and lit by every point light in range — are what actually costs the
// frame. This module picks a quality profile from the device once, and the
// renderer, texture loader and light placement read it instead of hardcoding
// desktop-grade numbers.

export type DeviceTier = "desktop" | "quest2" | "quest3";

export interface RenderQuality {
  tier: DeviceTier;
  /** Human-readable reason for the tier, logged once and exposed for debugging. */
  label: string;
  /** Hard cap on generated/rasterised colour texture resolution, in px. */
  maxTextureSize: number;
  /** Same for normal maps; null disables normal mapping entirely. */
  maxNormalMapSize: number | null;
  /** Texture.anisotropy. Grazing-angle floors are where this gets expensive. */
  anisotropy: number;
  /** How many fixtures may cast a real pointLight (the rest still glow). */
  pointLightBudget: number;
  /** WebGLRenderer context attribute. */
  antialias: boolean;
  /** Upper bound for the non-XR canvas pixel ratio. */
  maxPixelRatio: number;
  /** XRWebGLLayer framebuffer scale — the direct fill-rate lever in a session. */
  xrFramebufferScale: number;
}

const DESKTOP: RenderQuality = {
  tier: "desktop",
  label: "desktop / laptop browser",
  maxTextureSize: 1024,
  maxNormalMapSize: 1024,
  anisotropy: 8,
  pointLightBudget: 28,
  antialias: true,
  maxPixelRatio: 2,
  xrFramebufferScale: 1,
};

// Snapdragon XR2 Gen 2 (Adreno 740). Keeps normal maps — they're most of what
// makes the plaster and floorboards read as surfaces rather than flat colour —
// but at a quarter of the texels and with the light loop roughly halved.
const QUEST3: RenderQuality = {
  tier: "quest3",
  label: "Quest 3 / 3S class standalone headset",
  maxTextureSize: 256,
  maxNormalMapSize: 256,
  anisotropy: 2,
  pointLightBudget: 12,
  antialias: true,
  maxPixelRatio: 1,
  xrFramebufferScale: 1,
};

// Snapdragon XR2 Gen 1 (Adreno 650) — Quest 2 and Quest Pro. Normal mapping is
// off here: three derives the tangent frame from screen-space derivatives, so
// every lit fragment on every wall pays for it, and it's the single biggest
// per-pixel cost these surfaces carry.
const QUEST2: RenderQuality = {
  tier: "quest2",
  label: "Quest 2 / Quest Pro class standalone headset",
  maxTextureSize: 256,
  maxNormalMapSize: null,
  anisotropy: 1,
  pointLightBudget: 8,
  antialias: true,
  maxPixelRatio: 1,
  xrFramebufferScale: 0.8,
};

const PROFILES: Record<DeviceTier, RenderQuality> = {
  desktop: DESKTOP,
  quest2: QUEST2,
  quest3: QUEST3,
};

function isTier(value: string): value is DeviceTier {
  return value === "desktop" || value === "quest2" || value === "quest3";
}

// ?quality=quest2 forces a tier. There is no way to feel a headset profile from
// a desktop otherwise, and remote-debugging a Quest to change one constant is
// a slow loop.
function readOverride(): RenderQuality | null {
  try {
    const requested = new URLSearchParams(window.location.search).get("quality");
    if (!requested || !isTier(requested)) return null;
    return { ...PROFILES[requested], label: `forced by ?quality=${requested}` };
  } catch {
    return null;
  }
}

// UNMASKED_RENDERER_WEBGL on a throwaway context. Desktop Chrome increasingly
// masks this, but Oculus Browser still reports the real Adreno part, which is
// what we need for the older builds whose UA says only "Quest".
function probeRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return renderer;
  } catch {
    return "";
  }
}

function detect(): RenderQuality {
  const override = readOverride();
  if (override) return override;

  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

  // Oculus Browser, Wolvic, and Pico's browser all identify themselves; a
  // desktop browser driving a tethered headset does not, and shouldn't be
  // downgraded — it has a real GPU behind it.
  if (!/OculusBrowser|Quest|Pico|Wolvic/i.test(ua)) return DESKTOP;

  // Recent Oculus Browser builds put the model in the UA: "(... ; Quest 3)".
  // The Quest 3 test deliberately also matches "Quest 3S".
  if (/Quest\s*3/i.test(ua)) return { ...QUEST3, label: "Quest 3 (user agent)" };
  if (/Quest\s*(2|Pro)/i.test(ua)) {
    return { ...QUEST2, label: "Quest 2 / Pro (user agent)" };
  }

  // Older builds report a bare "Quest". Adreno 7xx is XR2 Gen 2 (Quest 3),
  // anything older is Quest 2 class or below.
  const renderer = probeRenderer();
  if (/Adreno[^0-9]*7\d\d/i.test(renderer)) {
    return { ...QUEST3, label: `Quest 3 class (${renderer})` };
  }
  return {
    ...QUEST2,
    label: renderer
      ? `standalone headset, assumed Quest 2 class (${renderer})`
      : "standalone headset, assumed Quest 2 class",
  };
}

let cached: RenderQuality | null = null;

/** Detected once per page load; the device can't change underneath us. */
export function getRenderQuality(): RenderQuality {
  if (!cached) {
    cached = detect();
    console.log(
      `[maze] render quality: ${cached.tier} — ${cached.label}`,
      cached
    );
  }
  return cached;
}

/** Clamp a requested texture resolution to what this device should be asked for. */
export function capTextureSize(requested: number, max: number): number {
  return Math.max(1, Math.min(requested, max));
}
