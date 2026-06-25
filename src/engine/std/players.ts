/**
 * std.players.two.v1 — two-player games with a current player and an opponent.
 *
 * Defines the `currentPlayer` and `opponent` globals and the `allPlayers` selector.
 * All two-player games import this module.
 */

import type { SourceRef, IRExpr, IRSelector } from "../ir/types";
import { currentPlayerExpr, opponentExpr } from "../ir/types";

export const PLAYERS_MODULE = "std.players.two.v1";

/** The player whose turn it currently is. */
export const currentPlayer: IRExpr = currentPlayerExpr;

/** The player who is not currently moving. */
export const opponent: IRExpr = opponentExpr;

/** The set of all players in the game. */
export function allPlayers(src?: SourceRef): IRSelector {
  return { kind: "allPlayers", irType: { kind: "selector", of: "player" }, src };
}
