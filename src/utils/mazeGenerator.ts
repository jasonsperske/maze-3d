export interface MazeCell {
  x: number;
  z: number;
  walls: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
  };
  visited: boolean;
}

export class MazeGenerator {
  private width: number;
  private height: number;
  private grid: MazeCell[][];
  private seed: number;
  private random: () => number;

  constructor(width: number, height: number, seed?: number) {
    this.width = width;
    this.height = height;
    this.seed = seed || Math.floor(Math.random() * 1000000);
    this.random = this.seededRandom(this.seed);
    this.grid = [];
    this.initializeGrid();
  }

  // Simple seeded random number generator
  private seededRandom(seed: number): () => number {
    let m_z = 987654321;
    let m_w = 123456789;
    const mask = 0xffffffff;
    
    // Apply seed
    m_z = (36969 * (seed & 65535) + (seed >> 16)) & mask;
    m_w = (18000 * (seed & 65535) + (seed >> 16)) & mask;
    
    return function() {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  }

  private initializeGrid(): void {
    for (let x = 0; x < this.width; x++) {
      this.grid[x] = [];
      for (let z = 0; z < this.height; z++) {
        this.grid[x][z] = {
          x,
          z,
          walls: {
            north: true,
            south: true,
            east: true,
            west: true,
          },
          visited: false,
        };
      }
    }
  }

  private getNeighbors(cell: MazeCell): MazeCell[] {
    const neighbors: MazeCell[] = [];
    const { x, z } = cell;

    if (x > 0) neighbors.push(this.grid[x - 1][z]); // West
    if (x < this.width - 1) neighbors.push(this.grid[x + 1][z]); // East
    if (z > 0) neighbors.push(this.grid[x][z - 1]); // North
    if (z < this.height - 1) neighbors.push(this.grid[x][z + 1]); // South

    return neighbors.filter(neighbor => !neighbor.visited);
  }

  private removeWall(current: MazeCell, neighbor: MazeCell): void {
    const dx = current.x - neighbor.x;
    const dz = current.z - neighbor.z;

    if (dx === 1) {
      current.walls.west = false;
      neighbor.walls.east = false;
    } else if (dx === -1) {
      current.walls.east = false;
      neighbor.walls.west = false;
    } else if (dz === 1) {
      current.walls.north = false;
      neighbor.walls.south = false;
    } else if (dz === -1) {
      current.walls.south = false;
      neighbor.walls.north = false;
    }
  }

  public generate(): MazeCell[][] {
    const stack: MazeCell[] = [];
    const startCell = this.grid[0][0];
    let currentCell = startCell;
    currentCell.visited = true;

    while (true) {
      const neighbors = this.getNeighbors(currentCell);

      if (neighbors.length > 0) {
        const randomNeighbor = neighbors[Math.floor(this.random() * neighbors.length)];
        
        stack.push(currentCell);
        
        this.removeWall(currentCell, randomNeighbor);
        
        randomNeighbor.visited = true;
        currentCell = randomNeighbor;
      } else if (stack.length > 0) {
        currentCell = stack.pop()!;
      } else {
        break;
      }
    }

    return this.grid;
  }

  public getMaze(): MazeCell[][] {
    return this.grid;
  }

  public getStartPosition(): { x: number; z: number } {
    // Use seeded random to determine a consistent starting position
    // Find an open area (cell with fewer walls)
    const candidates: { x: number; z: number; wallCount: number }[] = [];
    
    for (let x = 1; x < this.width - 1; x++) {
      for (let z = 1; z < this.height - 1; z++) {
        const cell = this.grid[x][z];
        const wallCount = Object.values(cell.walls).filter(Boolean).length;
        if (wallCount <= 2) { // Open areas
          candidates.push({ x: x * 4 + 2, z: z * 4 + 2, wallCount });
        }
      }
    }
    
    if (candidates.length > 0) {
      // Sort by least walls, then pick one using seeded random
      candidates.sort((a, b) => a.wallCount - b.wallCount);
      const topCandidates = candidates.filter(c => c.wallCount === candidates[0].wallCount);
      const chosen = topCandidates[Math.floor(this.random() * topCandidates.length)];
      return { x: chosen.x, z: chosen.z };
    }
    
    // Fallback to center if no good candidates
    return { x: 2, z: 2 };
  }
}