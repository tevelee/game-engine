import { describe, it, expect } from "vitest";
import {
  $, lit, global, currentPlayer, opponent, turnNumber,
  allCells, emptyCells, cellsAtDistance, rookRayCells, bishopRayCells,
  rayCells, connectedGroup, explicitCells, cellsInZone,
  allPieces, piecesAtCell, allPlayers, filter, filterEmpty, union, intersection, difference,
  exists, forAll, countCompare, isEmpty, isOccupied, hasPiece,
  boardFull, boardEmpty, distanceMatches, groupHasLiberty, connects,
  hasLegalAction, equals, compare, not, and, or,
  seq, when, forEach,
  placePiece, removePiece, movePiece, setPieceOwner, convertPieces,
  addScore, setScore, setVar, incrementVar, advanceTurn, setNextPlayer,
  define, getDef,
} from "./builders";

// ─── Expression builders ──────────────────────────────────────────────────────

describe("$ (var)", () => {
  it("produces a var node", () => {
    expect($("source")).toMatchObject({ kind: "var", name: "source", irType: "cell" });
  });
});

describe("lit", () => {
  it("null → void", () => {
    const n = lit(null);
    expect(n).toMatchObject({ kind: "lit", value: null, irType: "void" });
  });
  it("boolean → bool", () => {
    expect(lit(true)).toMatchObject({ kind: "lit", value: true, irType: "bool" });
    expect(lit(false)).toMatchObject({ kind: "lit", value: false, irType: "bool" });
  });
  it("number → int", () => {
    expect(lit(42)).toMatchObject({ kind: "lit", value: 42, irType: "int" });
  });
  it("string → cell", () => {
    expect(lit("a1")).toMatchObject({ kind: "lit", value: "a1", irType: "cell" });
  });
});

describe("global", () => {
  it("defaults to player irType", () => {
    expect(global("currentPlayer")).toMatchObject({ kind: "global", name: "currentPlayer", irType: "player" });
  });
  it("accepts custom irType", () => {
    expect(global("turnNumber", "int")).toMatchObject({ kind: "global", irType: "int" });
  });
});

describe("well-known globals", () => {
  it("currentPlayer is global player", () => {
    expect(currentPlayer).toMatchObject({ kind: "global", name: "currentPlayer", irType: "player" });
  });
  it("opponent is global player", () => {
    expect(opponent).toMatchObject({ kind: "global", name: "opponent", irType: "player" });
  });
  it("turnNumber is global int", () => {
    expect(turnNumber).toMatchObject({ kind: "global", name: "turnNumber", irType: "int" });
  });
});

// ─── Selector builders ────────────────────────────────────────────────────────

describe("allCells", () => {
  it("produces allCells node with correct irType", () => {
    expect(allCells("main")).toMatchObject({ kind: "allCells", board: "main", irType: { kind: "selector", of: "cell" } });
  });
  it("attaches src when provided", () => {
    expect(allCells("main", { module: "test" })).toMatchObject({ src: { module: "test" } });
  });
});

describe("emptyCells", () => {
  it("produces emptyCells node", () => {
    expect(emptyCells("main").kind).toBe("emptyCells");
  });
});

describe("cellsAtDistance", () => {
  it("stores all fields", () => {
    expect(cellsAtDistance("main", $("source"), "king", "exactly", 1)).toMatchObject({
      kind: "cellsAtDistance", board: "main", metric: "king", mode: "exactly", value: 1,
      from: { kind: "var", name: "source" },
    });
  });
});

describe("rookRayCells / bishopRayCells / rayCells", () => {
  it("rookRayCells stores board and from", () => {
    const s = rookRayCells("main", $("pos"), "any");
    expect(s).toMatchObject({ kind: "rookRayCells", board: "main", blockedBy: "any" });
  });
  it("bishopRayCells", () => {
    expect(bishopRayCells("main", currentPlayer).kind).toBe("bishopRayCells");
  });
  it("rayCells stores dx/dy/maxSteps", () => {
    const s = rayCells("main", $("pos"), 1, 0, { maxSteps: 3 });
    expect(s).toMatchObject({ kind: "rayCells", dx: 1, dy: 0, maxSteps: 3 });
  });
});

describe("connectedGroup", () => {
  it("stores pieceType and owner", () => {
    expect(connectedGroup("main", $("pos"), { pieceType: "stone", owner: currentPlayer })).toMatchObject({
      kind: "connectedGroup", pieceType: "stone",
      owner: { kind: "global", name: "currentPlayer" },
    });
  });
});

describe("explicitCells", () => {
  it("stores coords list", () => {
    const s = explicitCells(["a1", "b2"]);
    expect(s).toMatchObject({ kind: "explicitCells", coords: ["a1", "b2"] });
  });
});

describe("cellsInZone", () => {
  it("stores zone", () => {
    const s = cellsInZone("main", "top");
    expect(s).toMatchObject({ kind: "cellsInZone", board: "main", zone: "top" });
  });
});

describe("allPieces", () => {
  it("stores optional pieceType and owner", () => {
    expect(allPieces("main", { pieceType: "stone", owner: currentPlayer })).toMatchObject({
      kind: "allPieces", board: "main", pieceType: "stone", irType: { kind: "selector", of: "piece" },
    });
  });
});

describe("piecesAtCell", () => {
  it("stores cell and optional filters", () => {
    expect(piecesAtCell($("cell"), { owner: opponent, pieceType: "pawn" })).toMatchObject({
      kind: "piecesAtCell", pieceType: "pawn", irType: { kind: "selector", of: "piece" },
    });
  });
});

describe("allPlayers", () => {
  it("produces selector of player", () => {
    expect(allPlayers()).toMatchObject({ kind: "allPlayers", irType: { kind: "selector", of: "player" } });
  });
});

describe("filter", () => {
  it("inherits irType from source selector", () => {
    expect(filter(allCells("main"), "cell", isEmpty($("cell")))).toMatchObject({
      kind: "filter", binding: "cell", irType: { kind: "selector", of: "cell" },
    });
  });
});

describe("filterEmpty", () => {
  it("wraps in a filter with isEmpty predicate", () => {
    expect(filterEmpty(allCells("main"))).toMatchObject({ kind: "filter", where: { kind: "isEmpty" } });
  });
});

describe("set operations", () => {
  it("union inherits irType of first member", () => {
    const u = union([allCells("main"), emptyCells("main")]);
    expect(u.kind).toBe("union");
    expect(u.irType).toEqual({ kind: "selector", of: "cell" });
  });
  it("union throws on empty array", () => {
    expect(() => union([])).toThrow();
  });
  it("intersection", () => {
    const i = intersection([allCells("main"), emptyCells("main")]);
    expect(i.kind).toBe("intersection");
  });
  it("difference", () => {
    const d = difference(allCells("main"), emptyCells("main"));
    expect(d.kind).toBe("difference");
  });
});

// ─── Predicate builders ───────────────────────────────────────────────────────

describe("exists / forAll / countCompare", () => {
  it("exists wraps selector", () => {
    const p = exists(allCells("main"));
    expect(p).toMatchObject({ kind: "exists", irType: "bool" });
  });
  it("forAll stores binding and where", () => {
    const p = forAll(allPlayers(), "p", equals($("p"), currentPlayer));
    expect(p).toMatchObject({ kind: "forAll", binding: "p" });
  });
  it("countCompare stores op and value", () => {
    const p = countCompare(allCells("main"), ">=", lit(10));
    expect(p).toMatchObject({ kind: "countCompare", op: ">=" });
  });
});

describe("cell inspection predicates", () => {
  it("isEmpty", () => {
    expect(isEmpty($("cell"))).toMatchObject({ kind: "isEmpty", irType: "bool" });
  });
  it("isOccupied", () => {
    expect(isOccupied($("cell"))).toMatchObject({ kind: "isOccupied" });
  });
  it("hasPiece with options", () => {
    const p = hasPiece($("cell"), { pieceType: "stone", owner: currentPlayer });
    expect(p).toMatchObject({ kind: "hasPiece", pieceType: "stone" });
  });
});

describe("board-wide predicates", () => {
  it("boardFull", () => {
    expect(boardFull("main")).toMatchObject({ kind: "boardFull", board: "main", irType: "bool" });
  });
  it("boardEmpty", () => {
    expect(boardEmpty("main")).toMatchObject({ kind: "boardEmpty" });
  });
});

describe("spatial predicates", () => {
  it("distanceMatches stores all fields", () => {
    const p = distanceMatches($("a"), $("b"), "manhattan", "atMost", 3);
    expect(p).toMatchObject({ kind: "distanceMatches", metric: "manhattan", mode: "atMost", value: 3 });
  });
  it("groupHasLiberty stores board and pieceType", () => {
    const p = groupHasLiberty($("cell"), "main", { pieceType: "stone" });
    expect(p).toMatchObject({ kind: "groupHasLiberty", board: "main", pieceType: "stone" });
  });
  it("connects stores zones", () => {
    const p = connects("main", currentPlayer, "top", "bottom");
    expect(p).toMatchObject({ kind: "connects", fromZone: "top", toZone: "bottom" });
  });
  it("hasLegalAction stores actions list", () => {
    const p = hasLegalAction(currentPlayer, ["clone", "jump"]);
    expect(p).toMatchObject({ kind: "hasLegalAction", actions: ["clone", "jump"] });
  });
});

describe("boolean logic", () => {
  it("not wraps predicate", () => {
    expect(not(boardFull("main"))).toMatchObject({ kind: "not", irType: "bool" });
  });
  it("and flattens single-element lists", () => {
    const single = and([boardFull("main")]);
    expect(single.kind).toBe("boardFull"); // flattened
  });
  it("and with multiple", () => {
    const a = and([boardFull("main"), boardEmpty("main")]);
    expect(a).toMatchObject({ kind: "and" });
    expect((a as { of: unknown[] }).of).toHaveLength(2);
  });
  it("or flattens single-element lists", () => {
    const single = or([boardFull("main")]);
    expect(single.kind).toBe("boardFull");
  });
  it("or with multiple", () => {
    expect(or([boardFull("main"), boardEmpty("main")])).toMatchObject({ kind: "or" });
  });
  it("equals produces equals predicate", () => {
    expect(equals($("a"), $("b"))).toMatchObject({ kind: "equals" });
  });
  it("compare produces compare predicate", () => {
    expect(compare(turnNumber, "<", lit(10))).toMatchObject({ kind: "compare", op: "<" });
  });
});

// ─── Effect builders ──────────────────────────────────────────────────────────

describe("seq", () => {
  it("flattens single-effect lists", () => {
    const e = seq([advanceTurn()]);
    expect(e.kind).toBe("advanceTurn");
  });
  it("wraps multiple effects in sequence", () => {
    const e = seq([advanceTurn(), advanceTurn()]);
    expect(e.kind).toBe("sequence");
    expect((e as { effects: unknown[] }).effects).toHaveLength(2);
  });
});

describe("when", () => {
  it("produces an if node", () => {
    const e = when(boardFull("main"), advanceTurn());
    expect(e).toMatchObject({ kind: "if", irType: "effect" });
    expect((e as { else?: unknown }).else).toBeUndefined();
  });
  it("stores else branch", () => {
    const e = when(boardFull("main"), advanceTurn(), advanceTurn());
    expect((e as { else: unknown }).else).toBeDefined();
  });
});

describe("forEach", () => {
  it("produces forEach node", () => {
    const e = forEach(allCells("main"), "cell", advanceTurn());
    expect(e).toMatchObject({ kind: "forEach", binding: "cell", irType: "effect" });
  });
});

describe("piece effects", () => {
  it("placePiece", () => {
    const e = placePiece("stone", currentPlayer, $("target"));
    expect(e).toMatchObject({ kind: "placePiece", pieceType: "stone", irType: "effect" });
  });
  it("removePiece", () => {
    expect(removePiece($("at"))).toMatchObject({ kind: "removePiece" });
  });
  it("movePiece", () => {
    expect(movePiece($("from"), $("to"))).toMatchObject({ kind: "movePiece" });
  });
  it("setPieceOwner", () => {
    expect(setPieceOwner($("cell"), currentPlayer)).toMatchObject({ kind: "setPieceOwner" });
  });
  it("convertPieces", () => {
    const e = convertPieces(allCells("main"), currentPlayer);
    expect(e).toMatchObject({ kind: "convertPieces", irType: "effect" });
  });
});

describe("score effects", () => {
  it("addScore", () => {
    expect(addScore(currentPlayer, lit(1))).toMatchObject({ kind: "addScore" });
  });
  it("setScore", () => {
    expect(setScore(currentPlayer, lit(0))).toMatchObject({ kind: "setScore" });
  });
});

describe("var effects", () => {
  it("setVar", () => {
    expect(setVar("koPoint", lit("a1"))).toMatchObject({ kind: "setVar", name: "koPoint" });
  });
  it("setVar with null", () => {
    expect(setVar("x", null)).toMatchObject({ kind: "setVar", value: null });
  });
  it("incrementVar defaults by=undefined", () => {
    const e = incrementVar("count");
    expect(e).toMatchObject({ kind: "incrementVar", name: "count" });
    expect((e as { by?: number }).by).toBeUndefined();
  });
  it("incrementVar with explicit by", () => {
    expect(incrementVar("count", 3)).toMatchObject({ by: 3 });
  });
});

describe("turn effects", () => {
  it("advanceTurn", () => {
    expect(advanceTurn()).toMatchObject({ kind: "advanceTurn", irType: "effect" });
  });
  it("setNextPlayer", () => {
    expect(setNextPlayer(currentPlayer)).toMatchObject({ kind: "setNextPlayer" });
  });
});

// ─── define / getDef ──────────────────────────────────────────────────────────

describe("define / getDef", () => {
  it("returns the original node (same irType, same kind)", () => {
    const base = allCells("main");
    const tagged = define(base, { name: "allMain", explain: "all cells on main board", module: "test.v1" });
    expect(tagged.kind).toBe("allCells");
    expect(tagged.irType).toEqual(base.irType);
  });

  it("sets src.definition and src.explain on the returned node", () => {
    const tagged = define(allCells("main"), { name: "allMain", explain: "test", module: "m" });
    expect(tagged.src?.definition).toBe("allMain");
    expect(tagged.src?.explain).toBe("test");
    expect(tagged.src?.module).toBe("m");
  });

  it("_def is non-enumerable (doesn't appear in JSON.stringify)", () => {
    const tagged = define(allCells("main"), { name: "foo" });
    const json = JSON.stringify(tagged);
    expect(json).not.toContain("_def");
  });

  it("getDef returns the IRDefinition", () => {
    const tagged = define(allCells("main"), { name: "foo", explain: "bar" });
    const def = getDef(tagged);
    expect(def).toBeDefined();
    expect(def!.name).toBe("foo");
    expect(def!.explain).toBe("bar");
  });

  it("getDef returns undefined for untagged nodes", () => {
    expect(getDef(allCells("main"))).toBeUndefined();
  });

  it("define preserves the value in _def", () => {
    const base = boardFull("main");
    const tagged = define(base, { name: "full" });
    const def = getDef(tagged)!;
    expect(def.value).toMatchObject({ kind: "boardFull" });
  });
});
