import { type MazeCell } from './mazeGenerator';

export interface DoorEntry {
  id: string;
  cell: { x: number; z: number };
  direction: 'north' | 'south' | 'east' | 'west';
  position: { x: number; y: number; z: number };
  dest_url: string;
}

function makeSeededRandom(seed: number): () => number {
  const mask = 0xffffffff;
  let m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
  let m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;
  return () => {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    return (((m_z << 16) + (m_w & 65535)) >>> 0) / 4294967296;
  };
}

export function listMazeDoors(
  maze: MazeCell[][],
  seed: number,
  cellSize: number,
  wallHeight: number,
  doorFrequency: number,
  halfHeightPartitions: boolean,
  _halfHeightFrequency: number,
  // When set, doors are placed only at these wall positions (key = "x,z,direction").
  // Bypasses random placement.
  explicitDoors?: Map<string, string>
): DoorEntry[] {
  const random = makeSeededRandom(seed);
  const halfRandom = makeSeededRandom(seed ^ 0xf00d);
  const doors: DoorEntry[] = [];
  const seenPositions = new Set<string>();

  // How far inside the door the player spawns — must exceed TRIGGER_DEPTH (1.0)
  // in FirstPersonController so they don't immediately re-trigger the door.
  const ENTRY_OFFSET = 1.5;
  const PLAYER_Y = 1.7;

  // Rotation Y (Three.js YXZ Euler, default camera faces -Z):
  //   north door → face south (+Z) → π
  //   south door → face north (-Z) → 0
  //   east  door → face west (-X) → π/2
  //   west  door → face east (+X) → -π/2
  const entryRotationY: Record<'north' | 'south' | 'east' | 'west', number> = {
    north:  Math.PI,
    south:  0,
    east:   Math.PI / 2,
    west:  -Math.PI / 2,
  };

  const buildEntryUrl = (
    direction: 'north' | 'south' | 'east' | 'west',
    px: number,
    pz: number
  ): string => {
    const rotY = entryRotationY[direction];
    const pos = {
      x: px + (direction === 'west' ? ENTRY_OFFSET : direction === 'east' ? -ENTRY_OFFSET : 0),
      y: PLAYER_Y,
      z: pz + (direction === 'north' ? ENTRY_OFFSET : direction === 'south' ? -ENTRY_OFFSET : 0),
    };
    const state = { seed, position: pos, rotation: { x: 0, y: rotY, z: 0 } };
    return (
      window.location.origin +
      window.location.pathname +
      '?hash=' +
      btoa(JSON.stringify(state))
    );
  };

  const checkWall = (
    x: number,
    z: number,
    direction: 'north' | 'south' | 'east' | 'west',
    px: number,
    pz: number
  ) => {
    let hasDoor: boolean;
    let label: string | null = null;
    if (explicitDoors) {
      label = explicitDoors.get(`${x},${z},${direction}`) ?? null;
      hasDoor = label !== null;
    } else {
      hasDoor = random() < doorFrequency;
      if (!hasDoor && halfHeightPartitions) halfRandom();
    }
    if (!hasDoor) return;

    // Shared walls render from both adjacent cells; dedupe by world position.
    const posKey = `${px},${pz}`;
    if (seenPositions.has(posKey)) return;
    seenPositions.add(posKey);

    doors.push({
      id: label ? `door-${label}-${direction}-${x}-${z}` : `door-${direction}-${x}-${z}`,
      cell: { x, z },
      direction,
      position: { x: px, y: wallHeight / 2, z: pz },
      dest_url: buildEntryUrl(direction, px, pz),
    });
  };

  maze.forEach((row, x) => {
    row.forEach((cell, z) => {
      const baseX = x * cellSize + cellSize / 2;
      const baseZ = z * cellSize + cellSize / 2;
      if (cell.walls.north) checkWall(x, z, 'north', baseX, baseZ - cellSize / 2);
      if (cell.walls.south) checkWall(x, z, 'south', baseX, baseZ + cellSize / 2);
      if (cell.walls.east)  checkWall(x, z, 'east',  baseX + cellSize / 2, baseZ);
      if (cell.walls.west)  checkWall(x, z, 'west',  baseX - cellSize / 2, baseZ);
    });
  });

  return doors;
}

// Simple hash function for door coordinates
export function hashCoordinates(x: number, y: number, z: number): string {
  const str = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Configuration
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_DOOR_API === 'true';
const DOOR_API_URL = import.meta.env.VITE_DOOR_API_URL || 'https://backrooms.zone/door';

// Mock API implementation
async function mockDoorAPI(
  currentUrl: string,
  mazeSeed: number,
  doorHash: string
): Promise<string> {
  console.log('Mock Door API called:', { currentUrl, mazeSeed, doorHash });
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Parse current URL to get base without search params
  const url = new URL(currentUrl);
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  
  // Return base URL without seed parameter to trigger return logic
  return baseUrl;
}

export interface PlayerContext {
  position: { x: number; y: number; z: number };
  rotationY: number;
}

// Real API implementation — navigates directly (server issues redirect)
function realDoorAPI(
  currentUrl: string,
  doorId: string,
  _player: PlayerContext
): void {
  const source = new URL(currentUrl);
  const params = new URLSearchParams({
    source: source.origin + source.pathname,
    door: doorId,
  });
  window.location.href = `${DOOR_API_URL}?${params.toString()}`;
}

// Main API call function - uses mock or real based on configuration
export async function callDoorAPI(
  currentUrl: string,
  mazeSeed: number,
  doorHash: string,
  doorId: string,
  player: PlayerContext
): Promise<void> {
  if (USE_MOCK_API) {
    mockDoorAPI(currentUrl, mazeSeed, doorHash);
  } else {
    realDoorAPI(currentUrl, doorId, player);
  }
}


// Local storage utilities
export interface StoredMazeData {
  seed: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

export function storeMazeData(data: StoredMazeData): void {
  localStorage.setItem('maze3d_data', JSON.stringify(data));
}

export function loadMazeData(): StoredMazeData | null {
  try {
    const stored = localStorage.getItem('maze3d_data');
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error loading maze data:', error);
    return null;
  }
}

export function clearMazeData(): void {
  localStorage.removeItem('maze3d_data');
}