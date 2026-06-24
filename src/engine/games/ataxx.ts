/**
 * Ataxx expressed in the new module system + IR.
 *
 * This file is the "game definition layer" — what a game designer writes.
 * It imports builder functions from the standard library and composes them
 * into named definitions, then assembles the full IRGame.
 *
 * Compare this to the v2 schema in src/rules/games/ataxx.ts — both describe
 * the same game.  The key differences here:
 *
 *   ✓  Named definitions with explain strings (ownStoneCells, cloneTargets, …)
 *   ✓  TypeScript type checks every builder call
 *   ✓  The resulting object IS the IR (no separate resolve pass needed)
 *   ✓  Source references are attached at definition time
 *   ✓  Parameterized definitions are just TypeScript functions
 */

import {
  $, lit, currentPlayer, opponent,
  allCells, piecesAtCell, allPlayers, filter,
  isEmpty, hasPiece, exists, not, and, distanceMatches, boardFull, countCompare, hasLegalAction,
  placePiece, movePiece, setPieceOwner, forEach, advanceTurn, seq,
  define, getDef,
} from "../ir/builders";
import type { IRGame, IRDefinition, IRSelector, IREffect } from "../ir/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOARD = "main";
const MODULE = "games.ataxx.v1";

// ─── Named definitions ────────────────────────────────────────────────────────
// Each definition is a named, reusable expression with an explain string.
// Parameterized definitions are TypeScript functions (no schema-level generics needed).

const ownStoneCells = define(
  filter(allCells(BOARD), "cell",
    exists(piecesAtCell($("cell"), { owner: currentPlayer, pieceType: "stone" }))
  ),
  { name: "ownStoneCells", explain: "cells containing one of the current player's stones", module: MODULE }
);

const opponentStoneCells = define(
  filter(allCells(BOARD), "cell",
    exists(piecesAtCell($("cell"), { owner: opponent, pieceType: "stone" }))
  ),
  { name: "opponentStoneCells", explain: "cells containing one of the opponent's stones", module: MODULE }
);

// Parameterized: takes the binding variable name, returns a selector.
const cloneTargets = (sourceVar: string): IRSelector => define(
  filter(allCells(BOARD), "cell",
    and([
      isEmpty($("cell")),
      distanceMatches($(sourceVar), $("cell"), "king", "exactly", 1),
    ])
  ),
  { name: "cloneTargets", explain: "empty cells exactly one king-step from source, including diagonals", module: MODULE }
);

const jumpTargets = (sourceVar: string): IRSelector => define(
  filter(allCells(BOARD), "cell",
    and([
      isEmpty($("cell")),
      distanceMatches($(sourceVar), $("cell"), "king", "exactly", 2),
    ])
  ),
  { name: "jumpTargets", explain: "empty cells exactly two king-steps from source, including diagonals", module: MODULE }
);

const adjacentEnemyPieces = (targetVar: string): IRSelector => define(
  filter(allCells(BOARD), "cell",
    and([
      hasPiece($("cell"), { owner: opponent, pieceType: "stone" }),
      distanceMatches($(targetVar), $("cell"), "king", "exactly", 1),
    ])
  ),
  { name: "adjacentEnemyPieces", explain: "enemy stones exactly one king-step from target", module: MODULE }
);

// A reusable effect: convert all adjacent enemy stones around a target cell.
const convertAdjacentEnemies = (targetVar: string): IREffect => define(
  forEach(
    adjacentEnemyPieces(targetVar), "enemyCell",
    setPieceOwner($("enemyCell"), currentPlayer),
  ),
  { name: "convertAdjacentEnemies", explain: "convert adjacent enemy stones to the current player's color", module: MODULE }
);

// ─── Game definition ──────────────────────────────────────────────────────────

// Collect all named definitions (non-parameterized ones; parameterized ones
// are collected per-action).
function collectDefs(...nodes: object[]): IRDefinition[] {
  return nodes.flatMap(n => {
    const d = getDef(n);
    return d ? [d] : [];
  });
}

export const ataxx: IRGame = {
  id: "games.ataxx.v1",
  version: 1,
  name: "Ataxx",
  description:
    "A two-player territory game on a 7×7 grid. Clone your stones by " +
    "expanding one step; jump two steps to relocate. After each placement, " +
    "adjacent enemy stones convert to your color.",

  modules: [
    "rules.kernel.v1",
    "std.players.two.v1",
    "std.turns.alternating.v1",
    "std.board.squareGrid.v1",
    "std.spatial.distance.v1",
    "std.pieces.ownedGridPieces.v1",
    "std.actions.noLegalActions.v1",
    "std.scoring.pieceCount.v1",
  ],

  board: { id: BOARD, width: 7, height: 7, coordinates: "algebraic" },
  players: ["black", "white"],
  pieceTypes: [{ id: "stone", capturedAs: "convert", stacking: "single" }],
  vars: [],

  setup: [
    placePiece("stone", lit("black"), lit("a1"), { module: MODULE, explain: "Black's starting stone at a1" }),
    placePiece("stone", lit("black"), lit("g7"), { module: MODULE, explain: "Black's starting stone at g7" }),
    placePiece("stone", lit("white"), lit("g1"), { module: MODULE, explain: "White's starting stone at g1" }),
    placePiece("stone", lit("white"), lit("a7"), { module: MODULE, explain: "White's starting stone at a7" }),
  ],

  definitions: [
    ...collectDefs(ownStoneCells, opponentStoneCells),
    // Parameterized definitions are shown as instances from each action:
    ...collectDefs(
      cloneTargets("source"),
      jumpTargets("source"),
      adjacentEnemyPieces("target"),
      convertAdjacentEnemies("target"),
    ),
  ],

  actions: [
    {
      id: "clone",
      label: "Clone",
      actor: currentPlayer,
      explain: "Place a new stone adjacent to an existing stone, then convert adjacent enemy stones.",
      bindings: [
        {
          name: "source",
          irType: "cell",
          from: ownStoneCells,
          explain: "choose one of your own stones",
          src: { module: MODULE, definition: "ownStoneCells" },
        },
        {
          name: "target",
          irType: "cell",
          from: cloneTargets("source"),
          explain: "choose an empty adjacent cell",
          src: { module: MODULE, definition: "cloneTargets" },
        },
      ],
      effects: seq([
        placePiece("stone", currentPlayer, $("target"),
          { module: MODULE, explain: "place a new stone at the target cell" }),
        convertAdjacentEnemies("target"),
        advanceTurn({ module: MODULE, explain: "end the current player's turn" }),
      ]),
      src: { module: MODULE },
    },

    {
      id: "jump",
      label: "Jump",
      actor: currentPlayer,
      explain: "Move a stone two steps away (vacating the source), then convert adjacent enemy stones.",
      bindings: [
        {
          name: "source",
          irType: "cell",
          from: ownStoneCells,
          explain: "choose one of your own stones",
          src: { module: MODULE, definition: "ownStoneCells" },
        },
        {
          name: "target",
          irType: "cell",
          from: jumpTargets("source"),
          explain: "choose an empty cell exactly two steps away",
          src: { module: MODULE, definition: "jumpTargets" },
        },
      ],
      effects: seq([
        movePiece($("source"), $("target"),
          { module: MODULE, explain: "move the stone from source to target, vacating source" }),
        convertAdjacentEnemies("target"),
        advanceTurn(),
      ]),
      src: { module: MODULE },
    },

    {
      id: "pass",
      label: "Pass",
      actor: currentPlayer,
      explain: "If you have no legal Clone or Jump, you must pass.",
      allowedWhen: not(
        hasLegalAction(currentPlayer, ["clone", "jump"],
          { module: "std.actions.noLegalActions.v1", explain: "current player has no clone or jump available" })
      ),
      bindings: [],
      effects: advanceTurn({ module: MODULE, explain: "skip the current player's turn" }),
      src: { module: MODULE },
    },
  ],

  endConditions: [
    {
      id: "boardFull",
      when: boardFull(BOARD, { module: "std.board.squareGrid.v1", explain: "the board is full" }),
      explain: "the board is full",
      src: { module: MODULE },
    },
    {
      id: "playerHasNoStones",
      when: exists(
        filter(allPlayers(), "player",
          countCompare(
            filter(allCells(BOARD), "cell",
              hasPiece($("cell"), { owner: $("player"), pieceType: "stone" })
            ),
            "==",
            lit(0),
          )
        )
      ),
      explain: "a player has no stones remaining",
      src: { module: MODULE },
    },
    {
      id: "neitherCanMove",
      when: and([
        not(hasLegalAction(currentPlayer, ["clone", "jump"])),
        not(hasLegalAction(opponent,       ["clone", "jump"])),
      ]),
      explain: "neither player has a legal Clone or Jump move",
      src: { module: MODULE },
    },
  ],

  result: {
    kind: "maxPieceCount",
    pieceType: "stone",
    board: BOARD,
    tie: "draw",
    src: { module: "std.scoring.pieceCount.v1", explain: "the player with the most stones wins; tie is a draw" },
  },
};
