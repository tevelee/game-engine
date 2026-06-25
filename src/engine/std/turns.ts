/**
 * std.turns.alternating.v1 — alternating turn order for two-player games.
 *
 * Provides the `turnNumber` global and effects for advancing or redirecting turns.
 */

import type { SourceRef, IRExpr, IREffect } from "../ir/types";

export const TURNS_MODULE = "std.turns.alternating.v1";

/** The current turn number (starts at 1, increments on advanceTurn). */
export const turnNumber: IRExpr = { kind: "global", name: "turnNumber", irType: "int" };

/** End the current player's turn; swap currentPlayer and increment turnNumber. */
export function advanceTurn(src?: SourceRef): IREffect {
  return { kind: "advanceTurn", irType: "effect", src };
}

/** Directly set which player moves next (for non-alternating turn orders). */
export function setNextPlayer(player: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setNextPlayer", player, irType: "effect", src };
}
