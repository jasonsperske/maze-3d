import { type MazeCell } from "./mazeGenerator";

export type CardinalDirection = "north" | "south" | "east" | "west";

export interface ParsedMap {
  grid: MazeCell[][];
  // Keyed by `${x},${z},${direction}` — every wall that is a door is recorded
  // from BOTH adjacent perspectives so renderers can look it up either way.
  doors: Map<string, string>;
  lights: Set<string>;
  start: { x: number; z: number; direction: CardinalDirection };
  width: number;
  height: number;
}

const DOOR_CHAR_RE = /^[0-9A-Za-z]$/;

const DIR_ARROWS: Record<string, CardinalDirection> = {
  "^": "north",
  v: "south",
  "<": "west",
  ">": "east",
};

export function directionToRotationY(dir: CardinalDirection): number {
  switch (dir) {
    case "north": return 0;
    case "west":  return Math.PI / 2;
    case "south": return Math.PI;
    case "east":  return -Math.PI / 2;
  }
}

export function parseAsciiMap(text: string): ParsedMap {
  const rawLines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (rawLines.length && rawLines[0] === "") rawLines.shift();
  while (rawLines.length && rawLines[rawLines.length - 1] === "") rawLines.pop();
  if (rawLines.length === 0) throw new Error("Empty map");

  if ((rawLines.length - 1) % 2 !== 0) {
    throw new Error(`Map row count must be 1 + 2*height, got ${rawLines.length}`);
  }
  const height = (rawLines.length - 1) / 2;

  const headerLen = rawLines[0].length;
  if ((headerLen - 1) % 3 !== 0) {
    throw new Error(`Map column count must be 1 + 3*width, got ${headerLen}`);
  }
  const width = (headerLen - 1) / 3;

  // Right-pad any short lines so indexing never reads undefined as a wall.
  const lines = rawLines.map((l) => l.padEnd(headerLen, " "));

  const grid: MazeCell[][] = [];
  for (let x = 0; x < width; x++) {
    grid[x] = [];
    for (let z = 0; z < height; z++) {
      grid[x][z] = {
        x,
        z,
        walls: { north: false, south: false, east: false, west: false },
        visited: true,
      };
    }
  }

  const doors = new Map<string, string>();
  const lights = new Set<string>();
  let start: ParsedMap["start"] | null = null;

  // Horizontal walls: rows 0, 2, 4, ... up to height*2
  for (let zw = 0; zw <= height; zw++) {
    const row = lines[zw * 2];
    for (let x = 0; x < width; x++) {
      const c1 = row[x * 3 + 1];
      const c2 = row[x * 3 + 2];

      let isWall = false;
      let doorLabel: string | null = null;

      if (c1 === "-" && c2 === "-") {
        isWall = true;
      } else if (DOOR_CHAR_RE.test(c1) && c1 === c2) {
        isWall = true;
        doorLabel = c1;
      } else if (c1 === " " && c2 === " ") {
        isWall = false;
      } else {
        throw new Error(`Invalid horizontal wall at row ${zw * 2}, col ${x * 3 + 1}: "${c1}${c2}"`);
      }

      if (!isWall) continue;
      if (zw > 0) {
        grid[x][zw - 1].walls.south = true;
        if (doorLabel) doors.set(`${x},${zw - 1},south`, doorLabel);
      }
      if (zw < height) {
        grid[x][zw].walls.north = true;
        if (doorLabel) doors.set(`${x},${zw},north`, doorLabel);
      }
    }
  }

  // Vertical walls + cell content: rows 1, 3, 5, ...
  for (let z = 0; z < height; z++) {
    const row = lines[z * 2 + 1];

    for (let xw = 0; xw <= width; xw++) {
      const c = row[xw * 3];
      let isWall = false;
      let doorLabel: string | null = null;

      if (c === "|") {
        isWall = true;
      } else if (DOOR_CHAR_RE.test(c)) {
        isWall = true;
        doorLabel = c;
      } else if (c === " ") {
        isWall = false;
      } else {
        throw new Error(`Invalid vertical wall at row ${z * 2 + 1}, col ${xw * 3}: "${c}"`);
      }

      if (!isWall) continue;
      if (xw > 0) {
        grid[xw - 1][z].walls.east = true;
        if (doorLabel) doors.set(`${xw - 1},${z},east`, doorLabel);
      }
      if (xw < width) {
        grid[xw][z].walls.west = true;
        if (doorLabel) doors.set(`${xw},${z},west`, doorLabel);
      }
    }

    for (let x = 0; x < width; x++) {
      const cc1 = row[x * 3 + 1];
      const cc2 = row[x * 3 + 2];
      for (const ch of [cc1, cc2]) {
        if (ch in DIR_ARROWS) {
          if (start) throw new Error("Multiple start positions in map");
          start = { x, z, direction: DIR_ARROWS[ch] };
        }
      }
      if (cc1 === "." || cc2 === ".") lights.add(`${x},${z}`);
    }
  }

  if (!start) throw new Error("No start position (^v<>) found in map");

  return { grid, doors, lights, start, width, height };
}
