/**
 * std.scoring.pieceCount.v1 — result rule: player with the most pieces wins.
 *
 * Provides a factory for the `maxPieceCount` result rule used by Ataxx, Reversi,
 * and any other game where the winner is determined by piece count at game end.
 */

import type { SourceRef, IRResultRule } from "../ir/types";

export const SCORING_MODULE = "std.scoring.pieceCount.v1";

/**
 * Result rule: the player who owns the most pieces of `pieceType` at game end wins.
 * If both players have the same count, the outcome is determined by `tie`.
 */
export function maxPieceCount(
  pieceType: string,
  board: string,
  tie: "draw" | "sharedWin" = "draw",
  src?: SourceRef,
): IRResultRule {
  return { kind: "maxPieceCount", pieceType, board, tie, src };
}
