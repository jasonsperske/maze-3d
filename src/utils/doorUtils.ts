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
const DOOR_API_URL = import.meta.env.VITE_DOOR_API_URL || 'https://backroo.ms/door';

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

// Real API implementation
async function realDoorAPI(
  currentUrl: string,
  mazeSeed: number,
  doorHash: string
): Promise<string> {
  console.log('Real Door API called:', { 
    url: DOOR_API_URL, 
    currentUrl, 
    mazeSeed, 
    doorHash 
  });

  const response = await fetch(DOOR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: currentUrl,
      maze_seed: mazeSeed,
      door_hash: doorHash
    })
  });
  
  if (!response.ok) {
    throw new Error(`Door API error: ${response.status} - ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.redirect_url || data.url;
}

// Main API call function - uses mock or real based on configuration
export async function callDoorAPI(
  currentUrl: string, 
  mazeSeed: number, 
  doorHash: string
): Promise<string> {
  if (USE_MOCK_API) {
    return mockDoorAPI(currentUrl, mazeSeed, doorHash);
  } else {
    return realDoorAPI(currentUrl, mazeSeed, doorHash);
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