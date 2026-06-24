import type { DistanceDefinition } from "../core/types";
import { cellFile, cellRank } from "../core/coordinates";

export type RelationMap = Map<string, number[][]>;

export function buildRelations(
  width: number,
  height: number,
  definitions: Record<string, DistanceDefinition>
): RelationMap {
  const map: RelationMap = new Map();

  for (const [name, def] of Object.entries(definitions)) {
    const cells: number[][] = [];
    for (let i = 0; i < width * height; i++) {
      cells.push(computeNeighbors(i, width, height, def));
    }
    map.set(name, cells);
  }

  return map;
}

function computeNeighbors(
  index: number,
  width: number,
  height: number,
  def: DistanceDefinition
): number[] {
  const f = cellFile(index, width);
  const r = cellRank(index, width);
  const neighbors: number[] = [];
  const d = def.distance;

  if (def.metric === "king") {
    for (let df = -d; df <= d; df++) {
      for (let dr = -d; dr <= d; dr++) {
        if (df === 0 && dr === 0) continue;
        const nf = f + df;
        const nr = r + dr;
        if (nf < 0 || nf >= width || nr < 0 || nr >= height) continue;
        const chebyshev = Math.max(Math.abs(df), Math.abs(dr));
        if (chebyshev === d) {
          neighbors.push(nr * width + nf);
        }
      }
    }
  } else if (def.metric === "rook") {
    // horizontal and vertical at exact distance
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    for (const [df, dr] of dirs) {
      const nf = f + df * d;
      const nr = r + dr * d;
      if (nf >= 0 && nf < width && nr >= 0 && nr < height) {
        neighbors.push(nr * width + nf);
      }
    }
  } else if (def.metric === "bishop") {
    const dirs = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
    ];
    for (const [df, dr] of dirs) {
      const nf = f + df * d;
      const nr = r + dr * d;
      if (nf >= 0 && nf < width && nr >= 0 && nr < height) {
        neighbors.push(nr * width + nf);
      }
    }
  }

  return neighbors;
}
