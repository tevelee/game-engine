// Algebraic coordinate helpers for square grids
// a1 = bottom-left, files are a-z (columns), ranks are 1-N (rows)

export function coordToIndex(coord: string, width: number): number {
  const file = coord.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(coord.slice(1), 10) - 1; // '1' = 0
  return rank * width + file;
}

export function indexToCoord(index: number, width: number): string {
  const file = index % width;
  const rank = Math.floor(index / width);
  return String.fromCharCode(97 + file) + (rank + 1);
}

export function isValidCoord(coord: string, width: number, height: number): boolean {
  if (!/^[a-z]\d+$/.test(coord)) return false;
  const file = coord.charCodeAt(0) - 97;
  const rank = parseInt(coord.slice(1), 10) - 1;
  return file >= 0 && file < width && rank >= 0 && rank < height;
}

export function cellFile(index: number, width: number): number {
  return index % width;
}

export function cellRank(index: number, width: number): number {
  return Math.floor(index / width);
}
