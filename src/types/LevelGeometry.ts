/** A wall as a 2D line segment in world XZ space. Rendering adds thickness (0.2 units). */
export interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  halfHeight?: boolean;  // player can't pass, camera can see over
  isDoor?: boolean;      // visual door frame; collision still solid
  color?: string;        // overrides level wall color when set
  id?: string;           // stable id, required when isDoor is true
}

export interface LevelGeometry {
  walls: WallSegment[];
  playerStart: { x: number; y: number; z: number; rotationY?: number };
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  wallHeight: number;
  /** Suggested positions for ceiling lights — providers fill this in. */
  lightHints: Array<{ x: number; z: number }>;
}
