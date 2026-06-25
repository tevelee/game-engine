/**
 * std.pieces.ownedGridPieces.v1 — owned pieces placed on cells.
 *
 * Provides selectors for querying pieces, predicates for cell occupancy,
 * and effects for placing, moving, and converting pieces.
 * Assumes at most one piece per cell (single-stacking).
 */

import type { SourceRef, IRExpr, IRSelector, IRPredicate, IREffect } from "../ir/types";
import { filter } from "../kernel/builders";

export const PIECES_MODULE = "std.pieces.ownedGridPieces.v1";

// ─── Piece selectors ──────────────────────────────────────────────────────────

/** Every piece on the given board, optionally filtered by type and/or owner. */
export function allPieces(
  board: string,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "allPieces", board, ...opts, irType: { kind: "selector", of: "piece" }, src };
}

/** Pieces occupying a specific cell, optionally filtered by type and/or owner. */
export function piecesAtCell(
  cell: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "piecesAtCell", cell, ...opts, irType: { kind: "selector", of: "piece" }, src };
}

// ─── Cell occupancy predicates ────────────────────────────────────────────────

/** True when `cell` has no piece on it. */
export function isEmpty(cell: IRExpr, src?: SourceRef): IRPredicate {
  return { kind: "isEmpty", cell, irType: "bool", src };
}

/** True when `cell` has at least one piece on it. */
export function isOccupied(cell: IRExpr, src?: SourceRef): IRPredicate {
  return { kind: "isOccupied", cell, irType: "bool", src };
}

/** True when `cell` contains a piece matching the given type and/or owner. */
export function hasPiece(
  cell: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRPredicate {
  return { kind: "hasPiece", cell, ...opts, irType: "bool", src };
}

// ─── Convenience: filter empty ────────────────────────────────────────────────

/** Filter a cell selector to only the cells that are currently empty. */
export function filterEmpty(from: IRSelector, src?: SourceRef): IRSelector {
  const b = "__c";
  return filter(from, b, isEmpty({ kind: "var", name: b, irType: "cell" }), src);
}

// ─── Piece effects ────────────────────────────────────────────────────────────

/** Place a new piece of the given type and owner at `at`. */
export function placePiece(pieceType: string, owner: IRExpr, at: IRExpr, src?: SourceRef): IREffect {
  return { kind: "placePiece", pieceType, owner, at, irType: "effect", src };
}

/** Remove whatever piece is at `at`. */
export function removePiece(at: IRExpr, src?: SourceRef): IREffect {
  return { kind: "removePiece", at, irType: "effect", src };
}

/** Move the piece at `from` to `to` (vacating the source cell). */
export function movePiece(from: IRExpr, to: IRExpr, src?: SourceRef): IREffect {
  return { kind: "movePiece", from, to, irType: "effect", src };
}

/** Change the owner of the piece at `at` to `owner`. */
export function setPieceOwner(at: IRExpr, owner: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setPieceOwner", at, owner, irType: "effect", src };
}

/** Bulk ownership change: set all pieces in the selector to `toOwner`. */
export function convertPieces(sel: IRSelector, toOwner: IRExpr, src?: SourceRef): IREffect {
  return { kind: "convertPieces", in: sel, toOwner, irType: "effect", src };
}
