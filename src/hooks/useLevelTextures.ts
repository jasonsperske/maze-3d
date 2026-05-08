import { useEffect, useState } from "react";
import * as THREE from "three";
import { type LevelConfig } from "../types/LevelConfig";
import { loadNormalMapFromSpec, loadTextureFromSpec } from "../utils/textureLoader";

export interface LevelTextures {
  wall: THREE.Texture | null;
  floor: THREE.Texture | null;
  ceiling: THREE.Texture | null;
  wallNormal: THREE.Texture | null;
  floorNormal: THREE.Texture | null;
  ceilingNormal: THREE.Texture | null;
}

const EMPTY: LevelTextures = {
  wall: null,
  floor: null,
  ceiling: null,
  wallNormal: null,
  floorNormal: null,
  ceilingNormal: null,
};

type ColorKey = "wall" | "floor" | "ceiling";

export function useLevelTextures(config: LevelConfig): LevelTextures {
  const [textures, setTextures] = useState<LevelTextures>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const created: THREE.Texture[] = [];

    // Normal maps are noise-based, so we can build them synchronously.
    const wallNormal = config.wallNormalMap ? loadNormalMapFromSpec(config.wallNormalMap) : null;
    const floorNormal = config.floorNormalMap ? loadNormalMapFromSpec(config.floorNormalMap) : null;
    const ceilingNormal = config.ceilingNormalMap ? loadNormalMapFromSpec(config.ceilingNormalMap) : null;
    if (wallNormal) created.push(wallNormal);
    if (floorNormal) created.push(floorNormal);
    if (ceilingNormal) created.push(ceilingNormal);

    const resolve = async (
      key: ColorKey,
      spec: LevelConfig["wallTexture"]
    ): Promise<[ColorKey, THREE.Texture | null]> => {
      if (!spec) return [key, null];
      try {
        const tex = await loadTextureFromSpec(spec);
        return [key, tex];
      } catch (err) {
        console.error(`useLevelTextures: failed to load ${key}`, err);
        return [key, null];
      }
    };

    Promise.all([
      resolve("wall", config.wallTexture),
      resolve("floor", config.floorTexture),
      resolve("ceiling", config.ceilingTexture),
    ]).then((entries) => {
      if (cancelled) {
        for (const [, tex] of entries) tex?.dispose();
        for (const tex of created) tex.dispose();
        return;
      }
      const next: LevelTextures = {
        ...EMPTY,
        wallNormal,
        floorNormal,
        ceilingNormal,
      };
      for (const [key, tex] of entries) {
        next[key] = tex;
        if (tex) created.push(tex);
      }
      setTextures(next);
    });

    return () => {
      cancelled = true;
      for (const tex of created) tex.dispose();
    };
  }, [
    config.wallTexture,
    config.floorTexture,
    config.ceilingTexture,
    config.wallNormalMap,
    config.floorNormalMap,
    config.ceilingNormalMap,
  ]);

  return textures;
}
