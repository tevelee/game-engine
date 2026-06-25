import { describe, it, expect } from "vitest";
import { IRGameRuntime } from "../runtime/IRGameRuntime";
import { tictactoe } from "./tictactoe";
import { coordToIndex } from "../../rules/core/coordinates";

function newRT() { return new IRGameRuntime(tictactoe); }

function stateWith(marks: { coord: string; player: 0 | 1 }[], currentPlayer: 0 | 1 = 0, turn = 1) {
  const cells = new Int8Array(9).fill(-1);
  for (const { coord, player } of marks) {
    cells[coordToIndex(coord, 3)] = player;
  }
  return { cells, currentPlayer, turnNumber: turn };
}

describe("tictactoe — initial state", () => {
  it("board is empty", () => {
    const rt = newRT();
    const s = rt.initialState();
    expect(Array.from(s.cells)).toEqual(new Array(9).fill(-1));
  });

  it("9 legal moves on empty board", () => {
    const rt = newRT();
    expect(rt.legalActions(rt.initialState())).toHaveLength(9);
  });
});

describe("tictactoe — after moves", () => {
  it("placed cells are removed from legal actions", () => {
    const rt = newRT();
    const s = stateWith([{ coord: "a1", player: 0 }, { coord: "b2", player: 1 }]);
    const legal = rt.legalActions(s);
    expect(legal).toHaveLength(7);
    expect(legal.every((a) => a.bindings.target !== "a1" && a.bindings.target !== "b2")).toBe(true);
  });
});

describe("tictactoe — win detection", () => {
  // After X plays, turn advances → currentPlayer=O, opponent=X. anyThreeInRow uses `opponent`.
  it("horizontal row win (row 1: a1,b1,c1)", () => {
    const rt = newRT();
    // X at a1,b1,c1; O at a2,b2. Turn is O's but X has 3-in-a-row.
    const s = stateWith([
      { coord: "a1", player: 0 }, { coord: "b1", player: 0 }, { coord: "c1", player: 0 },
      { coord: "a2", player: 1 }, { coord: "b2", player: 1 },
    ], 1 /* O's turn */);
    const outcome = rt.outcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe("X");
  });

  it("vertical column win (col a: a1,a2,a3)", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a1", player: 0 }, { coord: "a2", player: 0 }, { coord: "a3", player: 0 },
      { coord: "b1", player: 1 }, { coord: "b2", player: 1 },
    ], 1);
    expect(rt.outcome(s)?.winner).toBe("X");
  });

  it("diagonal win (a1,b2,c3)", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a1", player: 0 }, { coord: "b2", player: 0 }, { coord: "c3", player: 0 },
      { coord: "a2", player: 1 }, { coord: "a3", player: 1 },
    ], 1);
    expect(rt.outcome(s)?.winner).toBe("X");
  });

  it("anti-diagonal win (a3,b2,c1)", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a3", player: 0 }, { coord: "b2", player: 0 }, { coord: "c1", player: 0 },
      { coord: "a1", player: 1 }, { coord: "a2", player: 1 },
    ], 1);
    expect(rt.outcome(s)?.winner).toBe("X");
  });

  it("O can win too", () => {
    const rt = newRT();
    // O has a1,b1,c1; currentPlayer=X (X just lost their chance)
    const s = stateWith([
      { coord: "a1", player: 1 }, { coord: "b1", player: 1 }, { coord: "c1", player: 1 },
      { coord: "a2", player: 0 }, { coord: "b2", player: 0 },
    ], 0 /* X's turn — O just won */);
    const outcome = rt.outcome(s);
    expect(outcome?.winner).toBe("O");
  });
});

describe("tictactoe — draw", () => {
  it("full board with no winner is a draw", () => {
    const rt = newRT();
    // Classic no-win arrangement: X O X / O X O / O X O
    // a1=X a2=O a3=O / b1=O b2=X b3=X / c1=X c2=O c3=O — wait, let me think
    // X at: b2,a1,c3,a3,c1 (5), O at: a2,b1,c2,b3 (4)... need 5+4=9
    //   a3=X  b3=O  c3=X
    //   a2=O  b2=X  c2=O
    //   a1=X  b1=O  c1=X
    // Check: no three in a row for either player
    // rows: a1,b1,c1 = X,O,X (no); a2,b2,c2 = O,X,O (no); a3,b3,c3 = X,O,X (no)
    // cols: a1,a2,a3 = X,O,X (no); b1,b2,b3 = O,X,O (no); c1,c2,c3 = X,O,X (no)
    // diag: a1,b2,c3 = X,X,X (YES! — this is a win for X, not a draw)
    // Let me use a different arrangement:
    //   a3=X  b3=O  c3=O
    //   a2=O  b2=X  c2=X
    //   a1=O  b1=X  c1=O  → currentPlayer = X's turn (even count, but we have 9 cells, 5+4 split)
    // Actually for draw, X has 5 marks and O has 4. Let's verify:
    // X: b3? no. Let me just hardcode known draw:
    //   a3=O  b3=X  c3=O
    //   a2=X  b2=O  c2=X
    //   a1=X  b1=O  c1=O  — X has 4, O has 5: but X goes first so X should have 5
    // Simplest known draw (X plays 1st, 3rd, 5th, 7th, 9th):
    //   a3=X  b3=O  c3=X
    //   a2=O  b2=X  c2=O
    //   a1=X  b1=O  c1=?
    // c1 must be X (9th move). Check diag a1,b2,c3 = X,X,X → win! Not a draw.
    // A well-known draw: X O X / X O O / O X X (row-first notation)
    // row3: a3=X b3=O c3=X; row2: a2=X b2=O c2=O; row1: a1=O b1=X c1=X
    // rows: no winner. cols: a=X,X,O(no); b=O,O,X(no); c=X,O,X(no)
    // diag a1,b2,c3 = O,O,X (no); a3,b2,c1 = X,O,X (no). It's a draw!
    const s = stateWith([
      { coord: "a3", player: 0 }, { coord: "b3", player: 1 }, { coord: "c3", player: 0 },
      { coord: "a2", player: 0 }, { coord: "b2", player: 1 }, { coord: "c2", player: 1 },
      { coord: "a1", player: 1 }, { coord: "b1", player: 0 }, { coord: "c1", player: 0 },
    ], 1 /* doesn't matter; board full */);
    const outcome = rt.outcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBeNull();
  });
});

describe("tictactoe — no outcome mid-game", () => {
  it("empty board has no outcome", () => {
    expect(newRT().outcome(newRT().initialState())).toBeNull();
  });

  it("partial board with no winner has no outcome", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a1", player: 0 }, { coord: "b2", player: 1 },
    ], 0);
    expect(rt.outcome(s)).toBeNull();
  });
});
