/**
 * games.ataxx.v1 — Ataxx expressed using the std library module system.
 *
 * Each import block corresponds to one node in the module dependency graph:
 *
 *   rules.kernel.v1              — expressions, selectors, predicates, effects
 *   std.players.two.v1           — currentPlayer, opponent, allPlayers
 *   std.turns.alternating.v1     — advanceTurn
 *   std.board.squareGrid.v1      — allCells, boardFull
 *   std.spatial.distance.v1      — distanceMatches
 *   std.pieces.ownedGridPieces.v1 — piecesAtCell, placePiece, movePiece, setPieceOwner
 *   std.actions.noLegalActions.v1 — hasLegalAction
 *   std.scoring.pieceCount.v1    — maxPieceCount result rule
 */

// rules.kernel.v1
import { $, lit, filter, exists, not, and, countCompare, seq, forEach, define, getDef }
  from "../kernel/builders";
// std.players.two.v1
import { currentPlayer, opponent, allPlayers } from "../std/players";
// std.turns.alternating.v1
import { advanceTurn } from "../std/turns";
// std.board.squareGrid.v1
import { allCells, boardFull } from "../std/board";
// std.spatial.distance.v1
import { distanceMatches } from "../std/spatial";
// std.pieces.ownedGridPieces.v1
import { piecesAtCell, placePiece, movePiece, setPieceOwner, hasPiece, isEmpty } from "../std/pieces";
// std.actions.noLegalActions.v1
import { hasLegalAction } from "../std/actions";
// std.scoring.pieceCount.v1
import { maxPieceCount } from "../std/scoring";

import type { IRGame, IRDefinition, IRSelector, IREffect } from "../ir/types";

// ─── Module metadata ──────────────────────────────────────────────────────────

const MODULE = "games.ataxx.v1";
const BOARD  = "main";

// ─── Named definitions ────────────────────────────────────────────────────────
//
// Each definition is a named, reusable expression with an explain string.
// Parameterized definitions are TypeScript functions — no schema-level generics.

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

const convertAdjacentEnemies = (targetVar: string): IREffect => define(
  forEach(
    adjacentEnemyPieces(targetVar), "enemyCell",
    setPieceOwner($("enemyCell"), currentPlayer),
  ),
  { name: "convertAdjacentEnemies", explain: "convert adjacent enemy stones to the current player's color", module: MODULE }
);

// ─── Definition collector ─────────────────────────────────────────────────────

function collectDefs(...nodes: object[]): IRDefinition[] {
  return nodes.flatMap(n => { const d = getDef(n); return d ? [d] : []; });
}

// ─── Game definition ──────────────────────────────────────────────────────────

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
        advanceTurn({ module: "std.turns.alternating.v1", explain: "end the current player's turn" }),
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

  result: maxPieceCount("stone", BOARD, "draw",
    { module: "std.scoring.pieceCount.v1", explain: "the player with the most stones wins; tie is a draw" }),
};
