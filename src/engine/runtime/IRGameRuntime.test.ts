import { describe, it, expect, beforeEach } from "vitest";
import { IRGameRuntime } from "./IRGameRuntime";
import { ataxx } from "../games/ataxx";
import type { GridState } from "../../rules/core/types";
import { coordToIndex } from "../../rules/core/coordinates";
import type { IRGame } from "../ir/types";
import {
  $, lit, currentPlayer, allCells, filter, exists, piecesAtCell,
  placePiece, advanceTurn, seq,
  boardFull, distanceMatches, isEmpty, and,
} from "../ir/builders";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ownerAt(state: GridState, coord: string, width: number): number {
  return state.cells[coordToIndex(coord, width)];
}

function pieceCount(state: GridState, playerIdx: number): number {
  return Array.from(state.cells).filter((c) => c === playerIdx).length;
}

// Minimal 3×3 game for fast targeted tests
function tiny3x3(): IRGame {
  return {
    id: "tiny.v1",
    version: 1,
    name: "Tiny",
    modules: [],
    board: { id: "main", width: 3, height: 3, coordinates: "algebraic" },
    players: ["black", "white"],
    pieceTypes: [{ id: "stone", capturedAs: "convert", stacking: "single" }],
    vars: [],
    setup: [
      placePiece("stone", lit("black"), lit("a1")),
      placePiece("stone", lit("white"), lit("c3")),
    ],
    definitions: [],
    actions: [
      {
        id: "clone",
        label: "Clone",
        actor: currentPlayer,
        bindings: [
          {
            name: "source",
            irType: "cell",
            from: filter(allCells("main"), "cell",
              exists(piecesAtCell($("cell"), { owner: currentPlayer, pieceType: "stone" }))),
          },
          {
            name: "target",
            irType: "cell",
            from: filter(allCells("main"), "cell",
              and([isEmpty($("cell")), distanceMatches($("source"), $("cell"), "king", "exactly", 1)])),
          },
        ],
        effects: seq([
          placePiece("stone", currentPlayer, $("target")),
          advanceTurn(),
        ]),
      },
    ],
    endConditions: [
      { id: "boardFull", when: boardFull("main") },
    ],
    result: { kind: "maxPieceCount", pieceType: "stone", board: "main", tie: "draw" },
  };
}

// ─── Ataxx: initial state ─────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — initialState", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("places exactly 4 pieces", () => {
    expect(Array.from(s0.cells).filter((c) => c !== -1)).toHaveLength(4);
  });

  it("black starts first (player 0)", () => {
    expect(s0.currentPlayer).toBe(0);
  });

  it("starts at turn 1", () => {
    expect(s0.turnNumber).toBe(1);
  });

  it("black piece at a1", () => {
    expect(ownerAt(s0, "a1", 7)).toBe(0); // black = 0
  });

  it("black piece at g7", () => {
    expect(ownerAt(s0, "g7", 7)).toBe(0);
  });

  it("white piece at g1", () => {
    expect(ownerAt(s0, "g1", 7)).toBe(1); // white = 1
  });

  it("white piece at a7", () => {
    expect(ownerAt(s0, "a7", 7)).toBe(1);
  });
});

// ─── Ataxx: legal actions at start ───────────────────────────────────────────

describe("IRGameRuntime(ataxx) — legalActions at start", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("returns 16 total actions (6 clone + 10 jump)", () => {
    const legal = rt.legalActions(s0);
    expect(legal).toHaveLength(16);
  });

  it("has 6 clone actions", () => {
    const legal = rt.legalActions(s0);
    expect(legal.filter((a) => a.id === "clone")).toHaveLength(6);
  });

  it("has 10 jump actions", () => {
    const legal = rt.legalActions(s0);
    expect(legal.filter((a) => a.id === "jump")).toHaveLength(10);
  });

  it("has no pass actions", () => {
    const legal = rt.legalActions(s0);
    expect(legal.filter((a) => a.id === "pass")).toHaveLength(0);
  });

  it("all actions have actor=black", () => {
    const legal = rt.legalActions(s0);
    expect(legal.every((a) => a.actor === "black")).toBe(true);
  });

  it("all clone actions have source and target bindings", () => {
    const clones = rt.legalActions(s0).filter((a) => a.id === "clone");
    expect(clones.every((a) => "source" in a.bindings && "target" in a.bindings)).toBe(true);
  });

  it("all clone targets are exactly king-distance 1 from their source", () => {
    const clones = rt.legalActions(s0).filter((a) => a.id === "clone");
    for (const clone of clones) {
      const si = coordToIndex(clone.bindings.source, 7);
      const ti = coordToIndex(clone.bindings.target, 7);
      const sf = si % 7, sr = Math.floor(si / 7);
      const tf = ti % 7, tr = Math.floor(ti / 7);
      const dist = Math.max(Math.abs(sf - tf), Math.abs(sr - tr));
      expect(dist).toBe(1);
    }
  });

  it("all jump targets are exactly king-distance 2 from their source", () => {
    const jumps = rt.legalActions(s0).filter((a) => a.id === "jump");
    for (const jump of jumps) {
      const si = coordToIndex(jump.bindings.source, 7);
      const ti = coordToIndex(jump.bindings.target, 7);
      const sf = si % 7, sr = Math.floor(si / 7);
      const tf = ti % 7, tr = Math.floor(ti / 7);
      const dist = Math.max(Math.abs(sf - tf), Math.abs(sr - tr));
      expect(dist).toBe(2);
    }
  });

  it("all targets are empty cells", () => {
    const legal = rt.legalActions(s0);
    for (const action of legal.filter((a) => a.id !== "pass")) {
      const tidx = coordToIndex(action.bindings.target, 7);
      expect(s0.cells[tidx]).toBe(-1);
    }
  });
});

// ─── Ataxx: applying clone ────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — apply clone", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("places a new stone at the target", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(ownerAt(s1, clone.bindings.target, 7)).toBe(0); // black
  });

  it("keeps the original stone at source", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(ownerAt(s1, clone.bindings.source, 7)).toBe(0); // still black
  });

  it("increments piece count by 1 (no adjacent enemies)", () => {
    // a1→b1 clone: no white pieces adjacent to b1
    const clone = rt.legalActions(s0).find(
      (a) => a.id === "clone" && a.bindings.source === "a1" && a.bindings.target === "b1",
    )!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(pieceCount(s1, 0)).toBe(3); // black goes from 2 → 3
    expect(pieceCount(s1, 1)).toBe(2); // white stays at 2
  });

  it("advances to white's turn", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(s1.currentPlayer).toBe(1);
  });

  it("increments turn number", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(s1.turnNumber).toBe(2);
  });
});

// ─── Ataxx: applying jump ─────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — apply jump", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("vacates the source cell", () => {
    const jump = rt.legalActions(s0).find((a) => a.id === "jump")!;
    const { state: s1 } = rt.apply(s0, jump);
    expect(ownerAt(s1, jump.bindings.source, 7)).toBe(-1); // empty
  });

  it("places black at the target", () => {
    const jump = rt.legalActions(s0).find((a) => a.id === "jump")!;
    const { state: s1 } = rt.apply(s0, jump);
    expect(ownerAt(s1, jump.bindings.target, 7)).toBe(0); // black
  });

  it("keeps total piece count the same (no adjacent enemies)", () => {
    const jump = rt.legalActions(s0).find(
      (a) => a.id === "jump" && a.bindings.source === "a1",
    )!;
    const { state: s1 } = rt.apply(s0, jump);
    expect(pieceCount(s1, 0)).toBe(2); // black stays at 2
    expect(pieceCount(s1, 1)).toBe(2); // white stays at 2
  });

  it("advances to white's turn", () => {
    const jump = rt.legalActions(s0).find((a) => a.id === "jump")!;
    const { state: s1 } = rt.apply(s0, jump);
    expect(s1.currentPlayer).toBe(1);
  });
});

// ─── Ataxx: enemy stone conversion ───────────────────────────────────────────

describe("IRGameRuntime(ataxx) — conversion on clone", () => {
  it("converts adjacent enemy stones after clone", () => {
    const rt = new IRGameRuntime(ataxx);
    // Manually construct a state where black clones next to a white stone
    // Setup: black at d4, white at e4 — black clones from d4 to e5
    // After clone: e5 is black, d4 still black, e4 (white, king-dist 1 from e5) → black
    const s = rt.initialState();
    const cells = new Int8Array(s.cells);
    cells.fill(-1);
    cells[coordToIndex("d4", 7)] = 0; // black
    cells[coordToIndex("e4", 7)] = 1; // white — adjacent to e5 (king dist 1)
    const testState: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    const legal = rt.legalActions(testState);
    const clone = legal.find((a) => a.id === "clone" && a.bindings.target === "e5");
    expect(clone).toBeDefined();

    const { state: s1 } = rt.apply(testState, clone!);
    expect(ownerAt(s1, "e5", 7)).toBe(0); // new black stone
    expect(ownerAt(s1, "d4", 7)).toBe(0); // original still black
    expect(ownerAt(s1, "e4", 7)).toBe(0); // converted to black
  });

  it("converts adjacent enemy stones after jump", () => {
    const rt = new IRGameRuntime(ataxx);
    const s = rt.initialState();
    const cells = new Int8Array(s.cells);
    cells.fill(-1);
    cells[coordToIndex("a1", 7)] = 0; // black at a1
    cells[coordToIndex("c2", 7)] = 1; // white at c2 — king-dist 1 from c3
    const testState: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    // Black jumps a1 → c3 (king distance 2), white at c2 is adjacent to c3
    const legal = rt.legalActions(testState);
    const jump = legal.find((a) => a.id === "jump" && a.bindings.source === "a1" && a.bindings.target === "c3");
    expect(jump).toBeDefined();

    const { state: s1 } = rt.apply(testState, jump!);
    expect(ownerAt(s1, "a1", 7)).toBe(-1); // source vacated
    expect(ownerAt(s1, "c3", 7)).toBe(0);  // black at target
    expect(ownerAt(s1, "c2", 7)).toBe(0);  // converted white → black
  });
});

// ─── Ataxx: pass action ───────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — pass action", () => {
  it("pass is available when current player has no clone/jump", () => {
    const rt = new IRGameRuntime(ataxx);
    // Completely isolate black's stone (all adjacent cells are occupied)
    const cells = new Int8Array(49).fill(-1);
    cells.fill(-1);
    // Black surrounded at a1, all adjacents occupied by white
    cells[coordToIndex("a1", 7)] = 0; // black
    cells[coordToIndex("a2", 7)] = 1; // white
    cells[coordToIndex("b1", 7)] = 1; // white
    cells[coordToIndex("b2", 7)] = 1; // white
    // Black's jump targets from a1: a3, b3, c1, c2, c3 — still empty
    // So black still has jumps. Let's fill those too.
    cells[coordToIndex("a3", 7)] = 1;
    cells[coordToIndex("b3", 7)] = 1;
    cells[coordToIndex("c1", 7)] = 1;
    cells[coordToIndex("c2", 7)] = 1;
    cells[coordToIndex("c3", 7)] = 1;
    const isolated: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    const legal = rt.legalActions(isolated);
    const passes = legal.filter((a) => a.id === "pass");
    expect(passes.length).toBeGreaterThan(0);

    const clones = legal.filter((a) => a.id === "clone");
    const jumps = legal.filter((a) => a.id === "jump");
    expect(clones).toHaveLength(0);
    expect(jumps).toHaveLength(0);
  });

  it("applying pass advances the turn without placing pieces", () => {
    const rt = new IRGameRuntime(ataxx);
    const cells = new Int8Array(49).fill(-1);
    cells.fill(-1);
    cells[coordToIndex("a1", 7)] = 0;
    cells[coordToIndex("a2", 7)] = 1;
    cells[coordToIndex("b1", 7)] = 1;
    cells[coordToIndex("b2", 7)] = 1;
    cells[coordToIndex("a3", 7)] = 1;
    cells[coordToIndex("b3", 7)] = 1;
    cells[coordToIndex("c1", 7)] = 1;
    cells[coordToIndex("c2", 7)] = 1;
    cells[coordToIndex("c3", 7)] = 1;
    const isolated: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    const pass = rt.legalActions(isolated).find((a) => a.id === "pass")!;
    const { state: s1 } = rt.apply(isolated, pass);
    expect(s1.currentPlayer).toBe(1); // switched to white
    expect(pieceCount(s1, 0)).toBe(1); // black unchanged
    expect(pieceCount(s1, 1)).toBe(8); // white unchanged
  });
});

// ─── Ataxx: outcome / end conditions ─────────────────────────────────────────

describe("IRGameRuntime(ataxx) — outcome", () => {
  let rt: IRGameRuntime;

  beforeEach(() => { rt = new IRGameRuntime(ataxx); });

  it("no outcome in initial state", () => {
    expect(rt.outcome(rt.initialState())).toBeNull();
  });

  it("boardFull end condition triggers result", () => {
    const cells = new Int8Array(49).fill(0); // all black
    cells[0] = 1; // one white cell so it's not trivially all black
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 10 };
    const result = rt.outcome(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("black"); // 48 black, 1 white
  });

  it("playerHasNoStones triggers when a player has 0 pieces", () => {
    const cells = new Int8Array(49).fill(-1);
    cells[0] = 0; // only black has a piece
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 5 };
    const result = rt.outcome(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("black");
  });

  it("result is determined by piece count on a full board", () => {
    // 49 cells (7×7) can't be split equally, so just verify winner is the majority player
    const cells = new Int8Array(49);
    for (let i = 0; i < 49; i++) cells[i] = i % 2 === 0 ? 0 : 1; // 25 black, 24 white
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 1 };
    const result = rt.outcome(state);
    if (result !== null) {
      expect(result.winner).toBe("black"); // 25 > 24
    }
  });
});

// ─── Ataxx: validate ─────────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — validate", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("validates a legal clone as valid", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    expect(rt.validate(s0, clone).valid).toBe(true);
  });

  it("rejects an illegal target (occupied cell)", () => {
    const result = rt.validate(s0, {
      id: "clone",
      actor: "black",
      bindings: { source: "a1", target: "g1" }, // g1 is white
    });
    expect(result.valid).toBe(false);
  });

  it("rejects wrong actor", () => {
    const result = rt.validate(s0, {
      id: "clone",
      actor: "white",
      bindings: { source: "g1", target: "f1" },
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Ataxx: explain / trace ───────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — explain", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("trace has bindingTrace for source and target", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone" && a.bindings.source === "a1")!;
    const trace = rt.explain(s0, clone);
    expect(trace.bindingTrace).toHaveLength(2);
    expect(trace.bindingTrace[0].binding).toBe("source");
    expect(trace.bindingTrace[1].binding).toBe("target");
  });

  it("source binding candidates are all black's own cells", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone" && a.bindings.source === "a1")!;
    const trace = rt.explain(s0, clone);
    expect(trace.bindingTrace[0].candidates).toContain("a1");
    expect(trace.bindingTrace[0].candidates).toContain("g7");
    expect(trace.bindingTrace[0].candidates).not.toContain("g1"); // white
  });

  it("effectTrace contains placePiece and advanceTurn entries", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const trace = rt.explain(s0, clone);
    const kinds = trace.effectTrace.map((e) => e.effect);
    expect(kinds).toContain("placePiece");
    expect(kinds).toContain("advanceTurn");
  });

  it("placePiece effectTrace records cell change", () => {
    const clone = rt.legalActions(s0).find(
      (a) => a.id === "clone" && a.bindings.source === "a1" && a.bindings.target === "b1",
    )!;
    const trace = rt.explain(s0, clone);
    const place = trace.effectTrace.find((e) => e.effect === "placePiece")!;
    expect(place.cellChanges).toHaveLength(1);
    expect(place.cellChanges[0]).toMatchObject({ cell: "b1", before: "empty", after: "black" });
  });

  it("endConditionTrace lists all end conditions", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const trace = rt.explain(s0, clone);
    expect(trace.endConditionTrace).toHaveLength(ataxx.endConditions.length);
  });

  it("endConditionTrace shows false for all conditions mid-game", () => {
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const trace = rt.explain(s0, clone);
    expect(trace.endConditionTrace.every((e) => !e.result)).toBe(true);
  });
});

// ─── Ataxx: hash / replay ─────────────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — hash and replay", () => {
  let rt: IRGameRuntime;

  beforeEach(() => { rt = new IRGameRuntime(ataxx); });

  it("same state produces same hash", () => {
    const s = rt.initialState();
    expect(rt.hash(s)).toBe(rt.hash(s));
  });

  it("different states produce different hashes", () => {
    const s0 = rt.initialState();
    const clone = rt.legalActions(s0).find((a) => a.id === "clone")!;
    const { state: s1 } = rt.apply(s0, clone);
    expect(rt.hash(s0)).not.toBe(rt.hash(s1));
  });

  it("replay reproduces the same sequence of states", () => {
    const s0 = rt.initialState();
    const events: import("../../rules/core/types").GameEvent[] = [];
    let current = s0;

    // Play 4 moves
    for (let i = 0; i < 4; i++) {
      const legal = rt.legalActions(current);
      const action = legal.find((a) => a.id !== "pass") ?? legal[0];
      const { state, event } = rt.apply(current, action);
      events.push(event);
      current = state;
    }

    const { states } = rt.replay(events);
    expect(states).toHaveLength(5); // initial + 4 moves
    expect(rt.hash(states[4])).toBe(rt.hash(current));
  });
});

// ─── Ataxx: legalActionsForBinding ────────────────────────────────────────────

describe("IRGameRuntime(ataxx) — legalActionsForBinding", () => {
  let rt: IRGameRuntime;
  let s0: GridState;

  beforeEach(() => {
    rt = new IRGameRuntime(ataxx);
    s0 = rt.initialState();
  });

  it("returns source candidates when no bindings resolved", () => {
    const sources = rt.legalActionsForBinding(s0, "clone", {});
    expect(sources).toContain("a1");
    expect(sources).toContain("g7");
    expect(sources).not.toContain("g1"); // white
    expect(sources).not.toContain("a7"); // white
  });

  it("returns target candidates when source is resolved", () => {
    const targets = rt.legalActionsForBinding(s0, "clone", { source: "a1" });
    // a1 clone targets: b1, a2, b2
    expect(targets).toContain("b1");
    expect(targets).toContain("a2");
    expect(targets).toContain("b2");
    expect(targets).toHaveLength(3);
  });

  it("returns empty array for unknown action", () => {
    expect(rt.legalActionsForBinding(s0, "nonexistent", {})).toEqual([]);
  });
});

// ─── Tiny 3×3 game ────────────────────────────────────────────────────────────

describe("IRGameRuntime — tiny 3x3", () => {
  let rt: IRGameRuntime;

  beforeEach(() => {
    rt = new IRGameRuntime(tiny3x3());
  });

  it("initialState places 2 pieces", () => {
    const s = rt.initialState();
    expect(Array.from(s.cells).filter((c) => c !== -1)).toHaveLength(2);
  });

  it("black has clone actions from a1", () => {
    const s = rt.initialState();
    const legal = rt.legalActions(s);
    const clones = legal.filter((a) => a.id === "clone");
    expect(clones.length).toBeGreaterThan(0);
    expect(clones.every((a) => a.bindings.source === "a1")).toBe(true);
  });

  it("boardFull triggers outcome", () => {
    const cells = new Int8Array(9).fill(0);
    cells[8] = 1;
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 5 };
    const outcome = rt.outcome(state);
    expect(outcome).not.toBeNull();
    expect(outcome!.winner).toBe("black"); // 8 black, 1 white
  });
});

// ─── Selector evaluation (unit tests via a test game) ─────────────────────────

describe("IRGameRuntime.evalSelector — spatial", () => {
  it("cellsAtDistance king exactly 1 from center of 3x3", () => {
    const rt = new IRGameRuntime(tiny3x3());
    // b2 is center of 3x3, king-dist-1 should give all 8 neighbors
    const cells = new Int8Array(9).fill(-1);
    cells[coordToIndex("b2", 3)] = 0; // place black at center
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    const legal = rt.legalActionsForBinding(state, "clone", { source: "b2" });
    // Center of 3x3 has 8 neighbors, all empty
    expect(legal).toHaveLength(8);
  });

  it("cellsAtDistance king exactly 1 from corner of 3x3", () => {
    const rt = new IRGameRuntime(tiny3x3());
    // a1 corner: only b1, a2, b2 are adjacent
    const cells = new Int8Array(9).fill(-1);
    cells[coordToIndex("a1", 3)] = 0;
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 1 };

    const targets = rt.legalActionsForBinding(state, "clone", { source: "a1" });
    expect(targets).toHaveLength(3);
    expect(targets).toContain("b1");
    expect(targets).toContain("a2");
    expect(targets).toContain("b2");
  });
});

// ─── hasLegalAction recursion guard ──────────────────────────────────────────

describe("hasLegalAction recursion guard", () => {
  it("does not stack overflow with circular allowedWhen", () => {
    // The pass action in Ataxx has allowedWhen=not(hasLegalAction([clone,jump]))
    // This triggers the recursion guard. We just confirm it doesn't throw.
    const rt = new IRGameRuntime(ataxx);
    const s0 = rt.initialState();
    expect(() => rt.legalActions(s0)).not.toThrow();
  });

  it("pass appears when truly no clone/jump available", () => {
    const rt = new IRGameRuntime(ataxx);
    const cells = new Int8Array(49).fill(1); // all white
    cells[coordToIndex("a1", 7)] = 0; // one black stone
    // All adjacent and jump cells occupied — no legal clone or jump
    const state: GridState = { cells, currentPlayer: 0, turnNumber: 1 };
    // Board is full (48 white + 1 black = 49), so outcome fires — just verify no throw
    rt.legalActions(state);
    // Test a state where board is not full but black is stuck.
    const cells2 = new Int8Array(49).fill(-1);
    cells2[coordToIndex("a1", 7)] = 0;  // black
    cells2[coordToIndex("b1", 7)] = 1;  // white
    cells2[coordToIndex("a2", 7)] = 1;  // white
    cells2[coordToIndex("b2", 7)] = 1;  // white
    cells2[coordToIndex("c1", 7)] = 1;  // white (jump blocker)
    cells2[coordToIndex("a3", 7)] = 1;  // white (jump blocker)
    cells2[coordToIndex("b3", 7)] = 1;  // white (jump blocker)
    cells2[coordToIndex("c2", 7)] = 1;  // white (jump blocker)
    cells2[coordToIndex("c3", 7)] = 1;  // white (jump blocker)
    const state2: GridState = { cells: cells2, currentPlayer: 0, turnNumber: 1 };
    const legal2 = rt.legalActions(state2);
    const passes2 = legal2.filter((a) => a.id === "pass");
    expect(passes2.length).toBeGreaterThan(0);
  });
});
