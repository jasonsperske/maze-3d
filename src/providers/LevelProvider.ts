import type { LevelGeometry } from '../types/LevelGeometry';
import type { LevelConfig } from '../types/LevelConfig';

export interface LevelProviderOptions {
  seed: number;
  config: LevelConfig;
}

export interface LevelProvider {
  name: string;
  generate(options: LevelProviderOptions): LevelGeometry;
}
