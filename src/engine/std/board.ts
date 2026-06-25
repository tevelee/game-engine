/**
 * std.board.squareGrid.v1 — rectangular square grid made of cells with x/y positions.
 *
 * Provides selectors for enumerating cells and predicates for board-wide state checks.
 */

import type { SourceRef, IRSelector, IRPredicate } from "../ir/types";

export const BOARD_MODULE = "std.board.squareGrid.v1";

// ─── Cell selectors ───────────────────────────────────────────────────────────

/** Every playable cell on the given board. */
export function allCells(board: string, src?: SourceRef): IRSelector {
  return { kind: "allCells", board, irType: { kind: "selector", of: "cell" }, src };
}

/** Every cell on the board that has no piece on it. */
export function emptyCells(board: string, src?: SourceRef): IRSelector {
  return { kind: "emptyCells", board, irType: { kind: "selector", of: "cell" }, src };
}

/** All cells that belong to a named zone (zones are declared in IRGame.board.zones). */
export function cellsInZone(board: string, zone: string, src?: SourceRef): IRSelector {
  return { kind: "cellsInZone", board, zone, irType: { kind: "selector", of: "cell" }, src };
}

/** An explicit hand-listed set of cell coordinates. */
export function explicitCells(coords: string[], src?: SourceRef): IRSelector {
  return { kind: "explicitCells", coords, irType: { kind: "selector", of: "cell" }, src };
}

// ─── Board predicates ─────────────────────────────────────────────────────────

/** True when every cell on the board is occupied. */
export function boardFull(board: string, src?: SourceRef): IRPredicate {
  return { kind: "boardFull", board, irType: "bool", src };
}

/** True when every cell on the board is empty. */
export function boardEmpty(board: string, src?: SourceRef): IRPredicate {
  return { kind: "boardEmpty", board, irType: "bool", src };
}
