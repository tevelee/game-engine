import { describe, it, expect } from "vitest";
import { IRGameRuntime } from "../runtime/IRGameRuntime";
import { hex } from "./hex";
import { coordToIndex } from "../../rules/core/coordinates";

function newRT() { return new IRGameRuntime(hex); }

function stateWith(stones: { coord: string; player: 0 | 1 }[], currentPlayer: 0 | 1 = 0, turn = 1) {
  const cells = new Int8Array(49).fill(-1);
  for (const { coord, player } of stones) {
    cells[coordToIndex(coord, 7)] = player;
  }
  return { cells, currentPlayer, turnNumber: turn };
}

describe("hex — initial state", () => {
  it("board is empty", () => {
    const rt = newRT();
    const s = rt.initialState();
    expect(Array.from(s.cells)).toEqual(new Array(49).fill(-1));
  });

  it("49 legal placements on empty board", () => {
    const rt = newRT();
    expect(rt.legalActions(rt.initialState())).toHaveLength(49);
  });
});

describe("hex — connection win", () => {
  it("black wins by connecting rank 7 to rank 1 down file d", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "d1", player: 0 }, { coord: "d2", player: 0 }, { coord: "d3", player: 0 },
      { coord: "d4", player: 0 }, { coord: "d5", player: 0 }, { coord: "d6", player: 0 },
      { coord: "d7", player: 0 },
    ]);
    const outcome = rt.outcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe("black");
  });

  it("white wins by connecting file a to file g along rank 4", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a4", player: 1 }, { coord: "b4", player: 1 }, { coord: "c4", player: 1 },
      { coord: "d4", player: 1 }, { coord: "e4", player: 1 }, { coord: "f4", player: 1 },
      { coord: "g4", player: 1 },
    ]);
    const outcome = rt.outcome(s);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe("white");
  });

  it("incomplete path is not a win", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "d1", player: 0 }, { coord: "d2", player: 0 }, { coord: "d3", player: 0 },
    ]);
    expect(rt.outcome(s)).toBeNull();
  });

  it("a broken (disconnected) path does not win", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "d1", player: 0 }, { coord: "d2", player: 0 },
      // gap at d3
      { coord: "d4", player: 0 }, { coord: "d5", player: 0 }, { coord: "d6", player: 0 },
      { coord: "d7", player: 0 },
    ]);
    expect(rt.outcome(s)).toBeNull();
  });

  it("path may zigzag through orthogonal steps", () => {
    const rt = newRT();
    const s = stateWith([
      { coord: "a7", player: 0 }, { coord: "a6", player: 0 }, { coord: "b6", player: 0 },
      { coord: "b5", player: 0 }, { coord: "b4", player: 0 }, { coord: "b3", player: 0 },
      { coord: "b2", player: 0 }, { coord: "a2", player: 0 }, { coord: "a1", player: 0 },
    ]);
    expect(rt.outcome(s)?.winner).toBe("black");
  });
});

describe("hex — placement", () => {
  it("placing fills the target cell with the current player and advances turn", () => {
    const rt = newRT();
    const s0 = rt.initialState();
    const r = rt.apply(s0, { id: "place", actor: "black", bindings: { target: "d4" } });
    expect(r.state.cells[coordToIndex("d4", 7)]).toBe(0);
    expect(r.state.currentPlayer).toBe(1);
  });
});
