import {
  $, lit, currentPlayer, opponent,
  emptyCells, boardFull, not, or, and, exists, hasLegalAction,
  captureRay, placePiece, forEach, setPieceOwner, advanceTurn, seq,
  define, getDef,
} from "../ir/builders";
import type { IRGame, IRDefinition } from "../ir/types";

const BOARD = "main";
const MODULE = "games.reversi.v1";

// All 8 ray directions
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// captureRay for one direction: cells flipped when currentPlayer places at $target
const flipRay = ([dx, dy]: [number, number]) =>
  captureRay(BOARD, $("target"), dx, dy, opponent, currentPlayer);

// Predicate: this placement flips at least one opponent disc
const canFlip = define(
  or(DIRS.map((d) => exists(flipRay(d)))),
  { name: "canFlip", explain: "placing here flips at least one opponent disc in some direction", module: MODULE },
);

function collectDefs(...nodes: object[]): IRDefinition[] {
  return nodes.flatMap((n) => { const d = getDef(n); return d ? [d] : []; });
}

export const reversi: IRGame = {
  id: "reversi",
  version: 1,
  name: "Reversi (Othello)",
  description:
    "Place discs to sandwich and flip opponent pieces along orthogonal and diagonal lines. " +
    "The player with the most discs when neither can move wins.",
  modules: [MODULE],

  board: { id: BOARD, width: 8, height: 8, coordinates: "algebraic" },
  players: ["black", "white"],
  pieceTypes: [{ id: "disc", capturedAs: "convert", stacking: "single" }],
  vars: [],

  // Standard Othello starting position (black at d5/e4, white at d4/e5)
  setup: [
    placePiece("disc", lit("black"), lit("d5")),
    placePiece("disc", lit("black"), lit("e4")),
    placePiece("disc", lit("white"), lit("d4")),
    placePiece("disc", lit("white"), lit("e5")),
  ],

  definitions: collectDefs(canFlip),

  actions: [
    {
      id: "place",
      label: "Place disc",
      actor: currentPlayer,
      bindings: [{
        name: "target",
        irType: "cell",
        from: emptyCells(BOARD),
        explain: "empty cell to place on",
      }],
      // Only legal if the placement sandwiches at least one opponent disc
      condition: canFlip,
      effects: seq([
        placePiece("disc", currentPlayer, $("target")),
        // Flip discs in all 8 directions
        ...DIRS.map(([dx, dy]) =>
          forEach(
            captureRay(BOARD, $("target"), dx, dy, opponent, currentPlayer),
            "flipped",
            setPieceOwner($("flipped"), currentPlayer),
          )
        ),
        advanceTurn(),
      ]),
    },
    {
      id: "pass",
      label: "Pass",
      actor: currentPlayer,
      bindings: [],
      allowedWhen: not(hasLegalAction(currentPlayer, ["place"])),
      effects: advanceTurn(),
    },
  ],

  endConditions: [
    { id: "board-full",  when: boardFull(BOARD),                                  explain: "board is full" },
    { id: "both-stuck",  when: and([not(hasLegalAction(currentPlayer, ["place"])),
                                    not(hasLegalAction(opponent,       ["place"]))]),
                                                                                   explain: "neither player can move" },
  ],

  result: { kind: "maxPieceCount", pieceType: "disc", board: BOARD, tie: "draw" },
};
