import { type ComponentType, type MutableRefObject } from "react";
import { VHSEffect } from "./VHSEffect";

export interface ShaderEffectProps {
  proximityRef: MutableRefObject<number>;
}

const registry: Record<string, ComponentType<ShaderEffectProps>> = {
  vhs: VHSEffect,
};

export function getShaderComponent(name: string): ComponentType<ShaderEffectProps> | null {
  return registry[name] ?? null;
}
