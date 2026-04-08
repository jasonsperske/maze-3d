import { useMemo } from "react";
import { MazeGenerator } from "../utils/mazeGenerator";

// Level 0 color scheme
const FLOOR_COLOR = "#c8b878";
const WALL_COLOR = "#d4c97a";

const COLS = 25;
const ROWS = 25;
const CELL = 20;
const WALL = 2;
const W = COLS * CELL;
const H = ROWS * CELL;

export function MazeSVG() {
  const cells = useMemo(() => {
    const gen = new MazeGenerator(COLS, ROWS);
    return gen.generate();
  }, []);

  const wallRects: { x: number; y: number; w: number; h: number }[] = [];

  for (let x = 0; x < COLS; x++) {
    for (let z = 0; z < ROWS; z++) {
      const cell = cells[x][z];
      const px = x * CELL;
      const py = z * CELL;

      if (cell.walls.north) wallRects.push({ x: px, y: py, w: CELL, h: WALL });
      if (cell.walls.south) wallRects.push({ x: px, y: py + CELL - WALL, w: CELL, h: WALL });
      if (cell.walls.west)  wallRects.push({ x: px, y: py, w: WALL, h: CELL });
      if (cell.walls.east)  wallRects.push({ x: px + CELL - WALL, y: py, w: WALL, h: CELL });
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }}
    >
      <rect width={W} height={H} fill={FLOOR_COLOR} />
      {wallRects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={WALL_COLOR} />
      ))}
    </svg>
  );
}
