import { type ComponentType, type MutableRefObject } from "react";
import { VHSEffect } from "./VHSEffect";
import { FilmEffect } from "./FilmEffect";

export interface ShaderEffectProps {
  proximityRef: MutableRefObject<number>;
  // Per-level tuning knobs from LevelConfig.shaderOptions
  options?: Record<string, number>;
}

const registry: Record<string, ComponentType<ShaderEffectProps>> = {
  vhs: VHSEffect,
  film: FilmEffect,
};

export function getShaderComponent(name: string): ComponentType<ShaderEffectProps> | null {
  return registry[name] ?? null;
}
