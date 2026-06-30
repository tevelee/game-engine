/**
 * games.hex.v1 — Hex on a 7×7 square grid.
 *
 * Black connects top (rank 7) to bottom (rank 1).
 * White connects left (file a) to right (file g).
 * Pieces are never removed; the board uses 4-connectivity (orthogonal BFS).
 *
 * Modules:
 *   rules.kernel.v1              — expressions, selectors, predicates, effects
 *   std.players.two.v1           — currentPlayer
 *   std.turns.alternating.v1     — advanceTurn
 *   std.board.squareGrid.v1      — emptyCells
 *   std.spatial.distance.v1      — connects
 *   std.pieces.ownedGridPieces.v1 — placePiece
 */

import { $, lit, emptyCells, placePiece, advanceTurn, seq, connects } from "../ir/builders";
import { currentPlayer } from "../std/players";
import type { IRGame } from "../ir/types";

const BOARD = "main";

const FILES = ["a", "b", "c", "d", "e", "f", "g"];
const RANKS = [1, 2, 3, 4, 5, 6, 7];

function zone(file?: string, rank?: number): string[] {
  if (file !== undefined) return RANKS.map((r) => `${file}${r}`);
  if (rank !== undefined) return FILES.map((f) => `${f}${rank}`);
  return [];
}

export const hex: IRGame = {
  id: "games.hex.v1",
  version: 1,
  name: "Hex",
  description:
    "Two players take turns placing stones on a 7×7 grid. " +
    "Black wins by connecting the top edge (rank 7) to the bottom edge (rank 1). " +
    "White wins by connecting the left edge (file a) to the right edge (file g). " +
    "Stones are never removed. The game cannot end in a draw.",

  modules: [
    "rules.kernel.v1",
    "std.players.two.v1",
    "std.turns.alternating.v1",
    "std.board.squareGrid.v1",
    "std.spatial.distance.v1",
    "std.pieces.ownedGridPieces.v1",
  ],

  board: {
    id: BOARD,
    width: 7,
    height: 7,
    coordinates: "algebraic",
    zones: {
      "black-top":    zone(undefined, 7),
      "black-bottom": zone(undefined, 1),
      "white-left":   zone("a"),
      "white-right":  zone("g"),
    },
  },

  players: ["black", "white"],
  pieceTypes: [{ id: "stone", capturedAs: "remove", stacking: "single" }],
  vars: [],
  setup: [],
  definitions: [],

  actions: [
    {
      id: "place",
      label: "Place stone",
      actor: currentPlayer,
      explain: "Place a stone on any empty cell.",
      bindings: [
        {
          name: "target",
          irType: "cell",
          from: emptyCells(BOARD),
          explain: "any empty cell",
        },
      ],
      effects: seq([
        placePiece("stone", currentPlayer, $("target"),
          { module: "games.hex.v1", explain: "place the current player's stone at the chosen cell" }),
        advanceTurn({ module: "std.turns.alternating.v1", explain: "end the current player's turn" }),
      ]),
      src: { module: "games.hex.v1" },
    },
  ],

  endConditions: [
    {
      id: "black-wins",
      when: connects(BOARD, lit("black"), "black-top", "black-bottom",
        { module: "games.hex.v1", explain: "black's stones form a path from rank 7 to rank 1" }),
      explain: "black connects top to bottom",
      src: { module: "games.hex.v1" },
    },
    {
      id: "white-wins",
      when: connects(BOARD, lit("white"), "white-left", "white-right",
        { module: "games.hex.v1", explain: "white's stones form a path from file a to file g" }),
      explain: "white connects left to right",
      src: { module: "games.hex.v1" },
    },
  ],

  result: {
    kind: "firstMatch",
    cases: [
      {
        condition: connects(BOARD, lit("black"), "black-top", "black-bottom"),
        winner: lit("black"),
        explain: "black connects top to bottom",
      },
      {
        condition: connects(BOARD, lit("white"), "white-left", "white-right"),
        winner: lit("white"),
        explain: "white connects left to right",
      },
    ],
  },
};
