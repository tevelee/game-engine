import { describe, it, expect } from "vitest";
import { printExpr, printSelector, printPredicate, printEffect, printIRGame } from "./printer";
import {
  $, lit, currentPlayer, opponent,
  allCells, emptyCells, piecesAtCell, allPlayers, allPieces,
  cellsAtDistance, rookRayCells, bishopRayCells, rayCells, connectedGroup,
  explicitCells, cellsInZone, filter, union, intersection, difference,
  exists, forAll, countCompare, isEmpty, isOccupied, hasPiece,
  boardFull, boardEmpty, distanceMatches, groupHasLiberty, connects,
  hasLegalAction, equals, compare, not, and, or,
  seq, when, forEach,
  placePiece, removePiece, movePiece, setPieceOwner, convertPieces,
  addScore, setScore, setVar, incrementVar, advanceTurn, setNextPlayer,
  define,
} from "./builders";
import { ataxx } from "../games/ataxx";

// ─── printExpr ────────────────────────────────────────────────────────────────

describe("printExpr", () => {
  it("lit null → 'null'", () => expect(printExpr(lit(null))).toBe("null"));
  it("lit 42 → '42'", () => expect(printExpr(lit(42))).toBe("42"));
  it("lit true → 'true'", () => expect(printExpr(lit(true))).toBe("true"));
  it("lit 'a1' → 'a1'", () => expect(printExpr(lit("a1"))).toBe("a1"));
  it("var → name", () => expect(printExpr($("source"))).toBe("source"));
  it("global → name", () => expect(printExpr(currentPlayer)).toBe("currentPlayer"));
  it("global opponent → 'opponent'", () => expect(printExpr(opponent)).toBe("opponent"));
});

// ─── printSelector ────────────────────────────────────────────────────────────

describe("printSelector", () => {
  it("allCells", () => expect(printSelector(allCells("main"))).toBe("allCells(main)"));
  it("emptyCells", () => expect(printSelector(emptyCells("main"))).toBe("emptyCells(main)"));
  it("allPlayers", () => expect(printSelector(allPlayers())).toBe("allPlayers()"));
  it("explicitCells", () => expect(printSelector(explicitCells(["a1","b2"]))).toBe("[a1, b2]"));
  it("cellsInZone", () => expect(printSelector(cellsInZone("main","top"))).toBe("zone(top)"));

  it("cellsAtDistance", () => {
    const s = printSelector(cellsAtDistance("main", $("src"), "king", "exactly", 1));
    expect(s).toBe("cellsAt(main, from=src, king exactly 1)");
  });

  it("rookRayCells", () => {
    const s = printSelector(rookRayCells("main", $("pos")));
    expect(s).toBe("rookRay(main, from=pos)");
  });
  it("rookRayCells with blockedBy", () => {
    const s = printSelector(rookRayCells("main", $("pos"), "any"));
    expect(s).toBe("rookRay(main, from=pos, blockedBy=any)");
  });

  it("bishopRayCells", () => {
    expect(printSelector(bishopRayCells("main", $("pos")))).toBe("bishopRay(main, from=pos)");
  });

  it("rayCells", () => {
    const s = printSelector(rayCells("main", $("pos"), 1, 0));
    expect(s).toBe("ray(main, from=pos, d=(1,0))");
  });
  it("rayCells with maxSteps", () => {
    const s = printSelector(rayCells("main", $("pos"), 1, 0, { maxSteps: 3 }));
    expect(s).toBe("ray(main, from=pos, d=(1,0), max=3)");
  });

  it("connectedGroup", () => {
    const s = printSelector(connectedGroup("main", $("pos")));
    expect(s).toBe("group(main, from=pos)");
  });
  it("connectedGroup with pieceType and owner", () => {
    const s = printSelector(connectedGroup("main", $("pos"), { pieceType: "stone", owner: currentPlayer }));
    expect(s).toBe("group(main, from=pos, type=stone, owner=currentPlayer)");
  });

  it("allPieces", () => {
    expect(printSelector(allPieces("main"))).toBe("allPieces(main)");
  });
  it("allPieces with filters", () => {
    const s = printSelector(allPieces("main", { pieceType: "stone", owner: currentPlayer }));
    expect(s).toBe("allPieces(main, type=stone, owner=currentPlayer)");
  });

  it("piecesAtCell", () => {
    const s = printSelector(piecesAtCell($("cell"), { owner: currentPlayer, pieceType: "stone" }));
    expect(s).toBe("piecesAt(cell, type=stone, owner=currentPlayer)");
  });

  it("filter", () => {
    const s = printSelector(filter(allCells("main"), "c", isEmpty($("c"))));
    expect(s).toContain("filter(allCells(main)) as c where isEmpty(c)");
  });

  it("union", () => {
    const s = printSelector(union([allCells("main"), emptyCells("main")]));
    expect(s).toBe("union(allCells(main), emptyCells(main))");
  });

  it("intersection", () => {
    const s = printSelector(intersection([allCells("main"), emptyCells("main")]));
    expect(s).toBe("intersection(allCells(main), emptyCells(main))");
  });

  it("difference", () => {
    const s = printSelector(difference(allCells("main"), emptyCells("main")));
    expect(s).toBe("diff(allCells(main) − emptyCells(main))");
  });

  it("includes src definition tag when present", () => {
    const tagged = define(allCells("main"), { name: "myDef", module: "test" });
    const s = printSelector(tagged);
    expect(s).toContain("{myDef}");
  });
});

// ─── printPredicate ───────────────────────────────────────────────────────────

describe("printPredicate", () => {
  it("true / false", () => {
    expect(printPredicate({ kind: "true", irType: "bool" })).toBe("true");
    expect(printPredicate({ kind: "false", irType: "bool" })).toBe("false");
  });

  it("exists", () => {
    expect(printPredicate(exists(allCells("main")))).toBe("exists(allCells(main))");
  });

  it("forAll", () => {
    const s = printPredicate(forAll(allPlayers(), "p", equals($("p"), currentPlayer)));
    expect(s).toContain("forAll(allPlayers()) as p:");
  });

  it("countCompare", () => {
    const p = printPredicate(countCompare(allCells("main"), ">=", lit(10)));
    expect(p).toBe("count(allCells(main)) >= 10");
  });

  it("equals", () => {
    expect(printPredicate(equals(currentPlayer, opponent))).toBe("currentPlayer == opponent");
  });

  it("compare", () => {
    expect(printPredicate(compare(lit(1), "<", lit(2)))).toBe("1 < 2");
  });

  it("isEmpty / isOccupied", () => {
    expect(printPredicate(isEmpty($("cell")))).toBe("isEmpty(cell)");
    expect(printPredicate(isOccupied($("cell")))).toBe("isOccupied(cell)");
  });

  it("hasPiece", () => {
    const p = printPredicate(hasPiece($("cell"), { pieceType: "stone", owner: currentPlayer }));
    expect(p).toBe("hasPiece(cell, type=stone, owner=currentPlayer)");
  });

  it("boardFull / boardEmpty", () => {
    expect(printPredicate(boardFull("main"))).toBe("boardFull(main)");
    expect(printPredicate(boardEmpty("main"))).toBe("boardEmpty(main)");
  });

  it("distanceMatches", () => {
    const p = printPredicate(distanceMatches($("a"), $("b"), "king", "exactly", 1));
    expect(p).toBe("distance(a, b, king) exactly 1");
  });

  it("groupHasLiberty", () => {
    const p = printPredicate(groupHasLiberty($("cell"), "main", { pieceType: "stone" }));
    expect(p).toBe("groupHasLiberty(cell, main, type=stone)");
  });

  it("connects", () => {
    const p = printPredicate(connects("main", currentPlayer, "north", "south"));
    expect(p).toBe("connects(main, currentPlayer, north→south)");
  });

  it("hasLegalAction", () => {
    const p = printPredicate(hasLegalAction(currentPlayer, ["clone", "jump"]));
    expect(p).toBe("hasLegalAction(currentPlayer, [clone, jump])");
  });

  it("not", () => {
    expect(printPredicate(not(boardFull("main")))).toBe("NOT boardFull(main)");
  });

  it("and joins with AND", () => {
    const p = printPredicate(and([boardFull("main"), boardEmpty("main")]));
    expect(p).toBe("boardFull(main) AND boardEmpty(main)");
  });

  it("or wraps in parens with OR", () => {
    const p = printPredicate(or([boardFull("main"), boardEmpty("main")]));
    expect(p).toBe("(boardFull(main) OR boardEmpty(main))");
  });

  it("includes src tag when present", () => {
    const tagged = define(boardFull("main"), { name: "full", module: "test" });
    expect(printPredicate(tagged)).toContain("{full}");
  });
});

// ─── printEffect ──────────────────────────────────────────────────────────────

describe("printEffect", () => {
  it("placePiece", () => {
    const e = printEffect(placePiece("stone", currentPlayer, $("target")));
    expect(e).toBe("placePiece(stone, owner=currentPlayer, at=target)");
  });

  it("removePiece", () => {
    expect(printEffect(removePiece($("at")))).toBe("removePiece(at)");
  });

  it("movePiece", () => {
    expect(printEffect(movePiece($("from"), $("to")))).toBe("movePiece(from → to)");
  });

  it("setPieceOwner", () => {
    expect(printEffect(setPieceOwner($("cell"), currentPlayer))).toBe("setPieceOwner(cell, currentPlayer)");
  });

  it("convertPieces", () => {
    const e = printEffect(convertPieces(allCells("main"), currentPlayer));
    expect(e).toContain("convertPieces(allCells(main), to=currentPlayer)");
  });

  it("addScore", () => {
    expect(printEffect(addScore(currentPlayer, lit(1)))).toBe("addScore(currentPlayer, 1)");
  });

  it("setScore", () => {
    expect(printEffect(setScore(currentPlayer, lit(0)))).toBe("setScore(currentPlayer, 0)");
  });

  it("setVar with value", () => {
    expect(printEffect(setVar("koPoint", lit("a1")))).toBe("setVar(koPoint, a1)");
  });

  it("setVar with null", () => {
    expect(printEffect(setVar("koPoint", null))).toBe("setVar(koPoint, null)");
  });

  it("incrementVar no by", () => {
    expect(printEffect(incrementVar("count"))).toBe("incrementVar(count)");
  });

  it("incrementVar with by=1 omits by", () => {
    expect(printEffect(incrementVar("count", 1))).toBe("incrementVar(count)");
  });

  it("incrementVar with by=3 includes it", () => {
    expect(printEffect(incrementVar("count", 3))).toBe("incrementVar(count, by=3)");
  });

  it("advanceTurn", () => {
    expect(printEffect(advanceTurn())).toBe("advanceTurn()");
  });

  it("setNextPlayer", () => {
    expect(printEffect(setNextPlayer(currentPlayer))).toBe("setNextPlayer(currentPlayer)");
  });

  it("if without else", () => {
    const e = printEffect(when(boardFull("main"), advanceTurn()));
    expect(e).toContain("if boardFull(main) then advanceTurn()");
    expect(e).not.toContain("else");
  });

  it("if with else", () => {
    const e = printEffect(when(boardFull("main"), advanceTurn(), advanceTurn()));
    expect(e).toContain("else");
  });

  it("forEach", () => {
    const e = printEffect(forEach(allCells("main"), "cell", advanceTurn()));
    expect(e).toContain("forEach allCells(main) as cell");
    expect(e).toContain("advanceTurn()");
  });

  it("sequence joins effects", () => {
    const e = printEffect(seq([advanceTurn(), advanceTurn()]));
    expect(e).toContain("advanceTurn()");
  });

  it("includes src definition tag", () => {
    const tagged = define(advanceTurn(), { name: "endTurn", module: "test" });
    expect(printEffect(tagged)).toContain("{endTurn}");
  });
});

// ─── printIRGame ──────────────────────────────────────────────────────────────

describe("printIRGame(ataxx)", () => {
  const output = printIRGame(ataxx);

  it("starts with Game: Ataxx", () => {
    expect(output).toMatch(/^Game: Ataxx/);
  });

  it("lists modules", () => {
    expect(output).toContain("Modules:");
    expect(output).toContain("rules.kernel.v1");
  });

  it("shows board dimensions", () => {
    expect(output).toContain("7×7");
  });

  it("lists players", () => {
    expect(output).toContain("black");
    expect(output).toContain("white");
  });

  it("shows definitions section", () => {
    expect(output).toContain("── Definitions ──");
    expect(output).toContain("ownStoneCells");
    expect(output).toContain("cloneTargets");
    expect(output).toContain("adjacentEnemyPieces");
  });

  it("includes explain strings for definitions", () => {
    expect(output).toContain("cells containing one of the current player");
  });

  it("shows setup section", () => {
    expect(output).toContain("── Setup ──");
    expect(output).toContain("placePiece(stone");
  });

  it("shows actions section with all three actions", () => {
    expect(output).toContain("── Actions ──");
    expect(output).toContain("Action: clone");
    expect(output).toContain("Action: jump");
    expect(output).toContain("Action: pass");
  });

  it("shows binding names with explain strings", () => {
    expect(output).toContain("Binding source");
    expect(output).toContain("Binding target");
    expect(output).toContain("choose one of your own stones");
  });

  it("shows effects for clone", () => {
    expect(output).toContain("placePiece");
    expect(output).toContain("advanceTurn()");
  });

  it("shows end conditions", () => {
    expect(output).toContain("── End conditions ──");
    expect(output).toContain("boardFull");
    expect(output).toContain("playerHasNoStones");
    expect(output).toContain("neitherCanMove");
  });

  it("shows result rule", () => {
    expect(output).toContain("── Result rule ──");
    expect(output).toContain("maxPieceCount");
  });
});
