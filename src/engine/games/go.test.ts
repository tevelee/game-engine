import { describe, it, expect } from "vitest";
import { IRGameRuntime } from "../runtime/IRGameRuntime";
import { go } from "./go";
import { coordToIndex } from "../../rules/core/coordinates";
import type { GridState } from "../../rules/core/types";

const W = 9;

function newRT() { return new IRGameRuntime(go); }

function stateWith(
  stones: { coord: string; player: 0 | 1 }[],
  currentPlayer: 0 | 1 = 0,
  turn = 1,
  consecutivePasses = 0,
): GridState {
  const cells = new Int8Array(W * W).fill(-1);
  for (const { coord, player } of stones) {
    cells[coordToIndex(coord, W)] = player;
  }
  return { cells, currentPlayer, turnNumber: turn, vars: { consecutivePasses } };
}

describe("go — initial state", () => {
  it("board is empty", () => {
    const rt = newRT();
    const s = rt.initialState();
    expect(Array.from(s.cells)).toEqual(new Array(81).fill(-1));
  });

  it("initial vars include consecutivePasses = 0", () => {
    const rt = newRT();
    expect(rt.initialState().vars).toEqual({ consecutivePasses: 0 });
  });

  it("81 legal placements + 1 pass on empty board", () => {
    const rt = newRT();
    const legal = rt.legalActions(rt.initialState());
    expect(legal.filter((a) => a.id === "place")).toHaveLength(81);
    expect(legal.filter((a) => a.id === "pass")).toHaveLength(1);
  });
});

describe("go — capture", () => {
  it("placing the last liberty captures a single surrounded stone", () => {
    const rt = newRT();
    // White stone at e5 surrounded by black on 3 sides; black plays the 4th liberty.
    const s = stateWith([
      { coord: "e5", player: 1 },
      { coord: "d5", player: 0 },
      { coord: "f5", player: 0 },
      { coord: "e6", player: 0 },
      // e4 open — black plays there to capture
    ], 0);
    const r = rt.apply(s, { id: "place", actor: "black", bindings: { target: "e4" } });
    expect(r.state.cells[coordToIndex("e5", W)]).toBe(-1); // captured
    expect(r.state.cells[coordToIndex("e4", W)]).toBe(0);  // black's new stone
  });

  it("captures an entire connected group sharing the last liberty", () => {
    const rt = newRT();
    // White group e5-e6 (vertical pair), liberties at d5,d6,f5,f6,e4,e7.
    // Surround all but e4, then black plays e4 to capture both stones.
    const s = stateWith([
      { coord: "e5", player: 1 }, { coord: "e6", player: 1 },
      { coord: "d5", player: 0 }, { coord: "f5", player: 0 },
      { coord: "d6", player: 0 }, { coord: "f6", player: 0 },
      { coord: "e7", player: 0 },
    ], 0);
    const r = rt.apply(s, { id: "place", actor: "black", bindings: { target: "e4" } });
    expect(r.state.cells[coordToIndex("e5", W)]).toBe(-1);
    expect(r.state.cells[coordToIndex("e6", W)]).toBe(-1);
  });

  it("does not capture a group that still has a liberty", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "e5", player: 1 },
      { coord: "d5", player: 0 }, { coord: "f5", player: 0 }, { coord: "e6", player: 0 },
      // e4 left open deliberately, black plays elsewhere
    ], 0);
    const r = rt.apply(s, { id: "place", actor: "black", bindings: { target: "a1" } });
    expect(r.state.cells[coordToIndex("e5", W)]).toBe(1); // still there
  });
});

describe("go — pass and end condition", () => {
  it("a single pass does not end the game", () => {
    const rt = newRT();
    const s = stateWith([], 0, 1, 0);
    expect(rt.outcome(s)).toBeNull();
    const r = rt.apply(s, { id: "pass", actor: "black", bindings: {} });
    expect(r.state.vars?.consecutivePasses).toBe(1);
    expect(rt.outcome(r.state)).toBeNull();
  });

  it("two consecutive passes end the game", () => {
    const rt = newRT();
    const s = stateWith([{ coord: "a1", player: 0 }], 0, 1, 1);
    const r = rt.apply(s, { id: "pass", actor: "white", bindings: {} });
    expect(r.state.vars?.consecutivePasses).toBe(2);
    const outcome = rt.outcome(r.state);
    expect(outcome).not.toBeNull();
  });

  it("placing a stone resets the consecutive pass counter", () => {
    const rt = newRT();
    const s = stateWith([], 0, 1, 1);
    const r = rt.apply(s, { id: "place", actor: "black", bindings: { target: "a1" } });
    expect(r.state.vars?.consecutivePasses).toBe(0);
  });
});

describe("go — scoring", () => {
  it("more stones on the board wins by maxPieceCount", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a1", player: 0 }, { coord: "b1", player: 0 }, { coord: "c1", player: 0 },
      { coord: "a2", player: 1 },
    ], 0, 1, 2);
    const outcome = rt.outcome(s);
    expect(outcome?.winner).toBe("black");
  });
});
