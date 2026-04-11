/**
 * DoomMapProvider — converts a JSON-encoded Doom-style map into LevelGeometry.
 *
 * Expected shape of `config.mapData` (as produced by tools/convert-doom.py):
 * {
 *   "wallHeight": 3,
 *   "linedefs": [
 *     {
 *       "x1": 72.4, "z1": 23.6,   // world-space start point
 *       "x2": 79.6, "z2": 25.2,   // world-space end point
 *       "isDoor": false,           // optional — portal/trigger wall
 *       "twoSided": false          // optional — open passage, no collision
 *     }
 *   ],
 *   "things": [
 *     { "type": "playerStart", "x": 68.6, "z": 15.6, "angle": 180 }
 *   ],
 *   "lightHints": [
 *     { "x": 84.4, "z": 35.35 }
 *   ]
 * }
 *
 * All coordinates are already in world units (produced by the Python converter).
 * The optional `_bounds` key is ignored — bounds are recomputed from linedefs.
 */

import type { LevelGeometry, WallSegment } from '../types/LevelGeometry';
import type { LevelProvider, LevelProviderOptions } from './LevelProvider';

interface DoomLinedef {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  isDoor?: boolean;     // portal/trigger — still solid, fires onDoorCollision
  twoSided?: boolean;   // open passage — no geometry, no collision
  height?: number;      // wall height override
  color?: string;       // material color override
}

interface DoomThing {
  type: string;
  x: number;
  z: number;
  angle?: number; // Doom degrees: 0 = east, 90 = north, CCW
}

interface DoomMapData {
  wallHeight?: number;
  linedefs: DoomLinedef[];
  things?: DoomThing[];
  lightHints?: Array<{ x: number; z: number }>;
}

function degreesToRotationY(angle: number): number {
  // Doom angle 0 = east (+X), 90 = north, CCW.
  // Three.js camera faces -Z at rotY = 0; direction = (-sin θ, 0, -cos θ).
  // After Z-flip (world Z = -doom Y), east = +X → rotY = -π/2.
  // General: rotY = (angle - 90) * π / 180
  return (angle - 90) * Math.PI / 180;
}

export const DoomMapProvider: LevelProvider = {
  name: 'DoomMap',

  generate({ config }: LevelProviderOptions): LevelGeometry {
    const mapData = (config as unknown as { mapData?: DoomMapData }).mapData;

    if (!mapData) {
      throw new Error(
        'DoomMapProvider: level config is missing required "mapData" property.'
      );
    }

    const wallHeight = mapData.wallHeight ?? 3;

    // Compute bounds from linedef endpoints
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const ld of mapData.linedefs) {
      if (ld.x1 < minX) minX = ld.x1;
      if (ld.x2 < minX) minX = ld.x2;
      if (ld.x1 > maxX) maxX = ld.x1;
      if (ld.x2 > maxX) maxX = ld.x2;
      if (ld.z1 < minZ) minZ = ld.z1;
      if (ld.z2 < minZ) minZ = ld.z2;
      if (ld.z1 > maxZ) maxZ = ld.z1;
      if (ld.z2 > maxZ) maxZ = ld.z2;
    }

    const walls: WallSegment[] = [];

    mapData.linedefs.forEach((ld, idx) => {
      // twoSided lines are open passages — skip entirely
      if (ld.twoSided) return;

      walls.push({
        id: ld.isDoor ? `doom-door-${idx}` : `doom-wall-${idx}`,
        x1: ld.x1,
        z1: ld.z1,
        x2: ld.x2,
        z2: ld.z2,
        height: ld.height ?? wallHeight,
        isDoor: ld.isDoor ?? false,
        color: ld.color,
      });
    });

    // Player start from THINGS
    let playerStart: LevelGeometry['playerStart'] = {
      x: (minX + maxX) / 2,
      y: 1.7,
      z: (minZ + maxZ) / 2,
    };

    if (mapData.things) {
      const ps = mapData.things.find((t) => t.type === 'playerStart');
      if (ps) {
        playerStart = {
          x: ps.x,
          y: 1.7,
          z: ps.z,
          rotationY: ps.angle !== undefined ? degreesToRotationY(ps.angle) : 0,
        };
      }
    }

    const lightHints: Array<{ x: number; z: number }> = mapData.lightHints ?? [];

    return {
      walls,
      playerStart,
      bounds: { minX, minZ, maxX, maxZ },
      wallHeight,
      lightHints,
    };
  },
};
