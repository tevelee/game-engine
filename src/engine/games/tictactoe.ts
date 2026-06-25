import {
  $, lit, currentPlayer, opponent,
  emptyCells, hasPiece, boardFull, not, and, or,
  placePiece, advanceTurn, seq,
} from "../ir/builders";
import type { IRGame } from "../ir/types";

const BOARD = "main";

// After advanceTurn() the player who just moved is now `opponent` from the new currentPlayer's view.
function line(coords: [string, string, string]) {
  return and(coords.map((c) => hasPiece(lit(c), { owner: opponent })));
}

const anyThreeInRow = or([
  // rows
  line(["a1", "b1", "c1"]),
  line(["a2", "b2", "c2"]),
  line(["a3", "b3", "c3"]),
  // columns
  line(["a1", "a2", "a3"]),
  line(["b1", "b2", "b3"]),
  line(["c1", "c2", "c3"]),
  // diagonals
  line(["a1", "b2", "c3"]),
  line(["a3", "b2", "c1"]),
]);

export const tictactoe: IRGame = {
  id: "tictactoe",
  version: 1,
  name: "Tic-tac-toe",
  description: "Classic 3-in-a-row game. First to complete a row, column, or diagonal wins.",
  modules: ["games.tictactoe.v1"],

  board: { id: BOARD, width: 3, height: 3, coordinates: "algebraic" },
  players: ["X", "O"],
  pieceTypes: [{ id: "mark", capturedAs: "remove", stacking: "single" }],
  vars: [],
  setup: [],
  definitions: [],

  actions: [{
    id: "mark",
    label: "Place mark",
    actor: currentPlayer,
    bindings: [{
      name: "target",
      irType: "cell",
      from: emptyCells(BOARD),
      explain: "any empty cell",
    }],
    effects: seq([
      placePiece("mark", currentPlayer, $("target")),
      advanceTurn(),
    ]),
  }],

  endConditions: [
    { id: "win",  when: anyThreeInRow, explain: "last player to move has three in a row" },
    { id: "draw", when: and([boardFull(BOARD), not(anyThreeInRow)]), explain: "board full with no winner" },
  ],

  result: {
    kind: "firstMatch",
    cases: [{ condition: anyThreeInRow, winner: opponent, explain: "three in a row" }],
    else: "draw",
  },
};
