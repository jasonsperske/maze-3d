import type { LevelProvider } from './LevelProvider';
import { ThreeDMazeProvider } from './3DMazeProvider';
import { DoomMapProvider } from './DoomMapProvider';

const PROVIDERS: Record<string, LevelProvider> = {
  '3DMaze': ThreeDMazeProvider,
  'DoomMap': DoomMapProvider,
};

export function getLevelProvider(walldef?: string): LevelProvider {
  const key = walldef ?? '3DMaze';
  const provider = PROVIDERS[key];
  if (!provider) {
    console.warn(`Unknown walldef "${key}", falling back to 3DMaze`);
    return ThreeDMazeProvider;
  }
  return provider;
}

export type { LevelProvider } from './LevelProvider';
