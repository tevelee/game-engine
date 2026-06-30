/**
 * games.go.simplified.v1 — Simplified Go on a 9×9 board.
 *
 * Rules implemented:
 *   - Standard placement on empty cells
 *   - Capture: opponent groups with no liberties are removed after each placement
 *   - Pass: always legal; two consecutive passes end the game
 *   - Scoring: piece count at game end (simplified — no territory, no komi)
 *
 * Rules NOT implemented (for simplicity):
 *   - Ko rule (no repeat-position detection)
 *   - Suicide rule (placing into a position with no liberty is allowed if it captures)
 *   - Area/territory scoring
 *
 * Modules:
 *   rules.kernel.v1              — expressions, selectors, predicates, effects
 *   std.players.two.v1           — currentPlayer, opponent
 *   std.turns.alternating.v1     — advanceTurn
 *   std.board.squareGrid.v1      — emptyCells
 *   std.spatial.distance.v1      — cellsAtDistance, groupHasLiberty, connectedGroup
 *   std.pieces.ownedGridPieces.v1 — placePiece, removePiece, hasPiece
 *   std.scoring.pieceCount.v1    — maxPieceCount
 */

import {
  $, lit, global, filter, and, not, forEach, seq, compare, setVar, incrementVar,
} from "../kernel/builders";
import { currentPlayer, opponent } from "../std/players";
import { advanceTurn } from "../std/turns";
import { emptyCells } from "../std/board";
import { cellsAtDistance, groupHasLiberty, connectedGroup } from "../std/spatial";
import { placePiece, removePiece, hasPiece } from "../std/pieces";
import { maxPieceCount } from "../std/scoring";
import type { IRGame } from "../ir/types";

const BOARD = "main";
const MODULE = "games.go.simplified.v1";

const consecutivePasses = global("consecutivePasses", "int");

// Opponent stones adjacent to the target cell that have no liberty after placement.
// Evaluated after the stone is placed, so the newly placed stone already reduces liberties.
const captureAdjacentGroups = forEach(
  filter(
    cellsAtDistance(BOARD, $("target"), "manhattan", "exactly", 1),
    "adjCell",
    and([
      hasPiece($("adjCell"), { owner: opponent }),
      not(groupHasLiberty($("adjCell"), BOARD)),
    ]),
  ),
  "captureHead",
  forEach(
    connectedGroup(BOARD, $("captureHead")),
    "groupCell",
    removePiece($("groupCell"), { module: MODULE, explain: "remove stone from captured group" }),
  ),
);

export const go: IRGame = {
  id: "games.go.simplified.v1",
  version: 1,
  name: "Go (simplified)",
  description:
    "Simplified 9×9 Go. Place stones, capture groups with no liberties. " +
    "Two consecutive passes end the game. Score by piece count (no territory or komi). " +
    "Ko rule and suicide rule are not enforced.",

  modules: [
    "rules.kernel.v1",
    "std.players.two.v1",
    "std.turns.alternating.v1",
    "std.board.squareGrid.v1",
    "std.spatial.distance.v1",
    "std.pieces.ownedGridPieces.v1",
    "std.scoring.pieceCount.v1",
  ],

  board: { id: BOARD, width: 9, height: 9, coordinates: "algebraic" },
  players: ["black", "white"],
  pieceTypes: [{ id: "stone", capturedAs: "remove", stacking: "single" }],

  vars: [
    { name: "consecutivePasses", type: "int", initial: 0, explain: "number of consecutive passes; resets on placement" },
  ],

  setup: [],
  definitions: [],

  actions: [
    {
      id: "place",
      label: "Place stone",
      actor: currentPlayer,
      explain: "Place a stone on an empty cell, then capture any opponent groups with no liberties.",
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
          { module: MODULE, explain: "place the current player's stone" }),
        captureAdjacentGroups,
        setVar("consecutivePasses", lit(0),
          { module: MODULE, explain: "reset the consecutive-pass counter" }),
        advanceTurn({ module: "std.turns.alternating.v1", explain: "end the current player's turn" }),
      ]),
      src: { module: MODULE },
    },

    {
      id: "pass",
      label: "Pass",
      actor: currentPlayer,
      explain: "Skip your turn. Two consecutive passes end the game.",
      bindings: [],
      effects: seq([
        incrementVar("consecutivePasses", 1,
          { module: MODULE, explain: "increment the consecutive-pass counter" }),
        advanceTurn({ module: "std.turns.alternating.v1", explain: "end the current player's turn" }),
      ]),
      src: { module: MODULE },
    },
  ],

  endConditions: [
    {
      id: "both-passed",
      when: compare(consecutivePasses, ">=", lit(2),
        { module: MODULE, explain: "both players have passed consecutively" }),
      explain: "both players passed consecutively",
      src: { module: MODULE },
    },
  ],

  result: maxPieceCount("stone", BOARD, "draw",
    { module: "std.scoring.pieceCount.v1", explain: "the player with the most stones on the board wins" }),
};
