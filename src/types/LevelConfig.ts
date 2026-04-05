export interface LevelConfig {
  // Visuals
  wallColor: string;
  floorColor: string;
  ceilingColor: string;

  // Doors
  doorFrequency: number; // 0–1 probability per wall

  // Lighting
  ambientLight: number; // three.js ambient intensity
  lightSpacing: number; // base cell stride between ceiling lights (higher = fewer)

  // Half-height partitions: walls the camera can see over but the player can't walk through
  halfHeightPartitions: boolean;
  halfHeightColor: string;
  halfHeightFrequency: number; // 0–1 probability that an eligible wall becomes half-height

  // Wider rooms: randomly remove internal walls post-generation so some areas open up
  widerRooms: boolean;
  widerRoomFrequency: number; // 0–1 probability that each internal wall is removed

  // Post-processing shader applied over the whole canvas, e.g. "vhs"
  shader?: string;
}

export const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  wallColor: "#666666",
  floorColor: "#444444",
  ceilingColor: "#222222",
  doorFrequency: 0.1,
  ambientLight: 0.05,
  lightSpacing: 8,
  halfHeightPartitions: false,
  halfHeightColor: "#555555",
  halfHeightFrequency: 0.3,
  widerRooms: false,
  widerRoomFrequency: 0.2,
};
