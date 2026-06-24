import type { GridState } from "./types";

export function hashState(state: GridState): string {
  let h = 0;
  for (let i = 0; i < state.cells.length; i++) {
    h = (Math.imul(31, h) + (state.cells[i] + 2)) | 0;
  }
  h = (Math.imul(31, h) + state.currentPlayer) | 0;
  h = (Math.imul(31, h) + state.turnNumber) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}
