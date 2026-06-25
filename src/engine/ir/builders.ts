/**
 * Builder functions — the authoring API for constructing IR nodes.
 *
 * These are the functions a game designer calls to express game logic.
 * Each function returns a fully-typed IR node; no separate resolution step
 * is needed because TypeScript is itself the expression evaluator.
 *
 * Naming convention
 * ─────────────────
 *   Selector builders:  noun phrases   → allCells(), emptyCellsAt(), piecesAt()
 *   Predicate builders: verb phrases   → isEmpty(), hasPiece(), exists(), not()
 *   Effect builders:    imperative     → placePiece(), movePiece(), seq()
 *   Expression helpers: short names    → $(), lit(), global()
 *
 * Source annotation
 * ─────────────────
 * Every builder accepts an optional final `src` argument that sets the
 * `src` field on the returned node. Use this to attach a human-readable
 * explanation and module origin to any node:
 *
 *   cellsAtDistance("main", $("source"), "king", "exactly", 1,
 *     { explain: "empty cells one king-step from source", module: "games.ataxx.v1" })
 *
 * Named definitions
 * ─────────────────
 * Use `define()` to attach a name and explain string to any selector,
 * predicate, or effect.  The definition is recorded in the game's
 * `definitions` array for documentation and the IR viewer.
 *
 *   const ownStoneCells = define(
 *     filterCells("main", "cell",
 *       exists(piecesAtCell($("cell"), { owner: currentPlayer, pieceType: "stone" }))
 *     ),
 *     { name: "ownStoneCells", explain: "cells containing one of the current player's stones" }
 *   );
 */

import type {
  IRType, SourceRef,
  IRExpr, IRSelector, IRPredicate, IREffect, IRDefinition,
} from "./types";
import { currentPlayerExpr, opponentExpr } from "./types";

// ─── Expression builders ──────────────────────────────────────────────────────

/** Reference a binding variable: $("source"), $("target"), $("cell") */
export function $(name: string): IRExpr {
  return { kind: "var", name, irType: "cell" };  // irType refined by context
}

/** Literal value: lit("a1"), lit(42), lit(true), lit(null) */
export function lit(value: null | boolean | number | string): IRExpr {
  const irType: IRType =
    value === null     ? "void"   :
    typeof value === "boolean" ? "bool"   :
    typeof value === "number"  ? "int"    : "cell"; // strings default to cell coords
  return { kind: "lit", value, irType };
}

/** Named global variable: global("currentPlayer"), global("turnNumber") */
export function global(name: string, irType: IRType = "player"): IRExpr {
  return { kind: "global", name, irType };
}

/** Well-known globals — use directly without calling global() */
export const currentPlayer: IRExpr = currentPlayerExpr;
export const opponent: IRExpr      = opponentExpr;
export const turnNumber: IRExpr    = { kind: "global", name: "turnNumber", irType: "int" };

// ─── Selector builders ────────────────────────────────────────────────────────

export function allCells(board: string, src?: SourceRef): IRSelector {
  return { kind: "allCells", board, irType: { kind: "selector", of: "cell" }, src };
}

export function emptyCells(board: string, src?: SourceRef): IRSelector {
  return { kind: "emptyCells", board, irType: { kind: "selector", of: "cell" }, src };
}

export function cellsAtDistance(
  board: string,
  from: IRExpr,
  metric: "king" | "manhattan",
  mode: "exactly" | "atMost" | "atLeast",
  value: number,
  src?: SourceRef,
): IRSelector {
  return { kind: "cellsAtDistance", board, from, metric, mode, value,
           irType: { kind: "selector", of: "cell" }, src };
}

export function rookRayCells(
  board: string, from: IRExpr,
  blockedBy?: "any" | "enemy" | "friendly" | "none",
  src?: SourceRef,
): IRSelector {
  return { kind: "rookRayCells", board, from, blockedBy,
           irType: { kind: "selector", of: "cell" }, src };
}

export function bishopRayCells(
  board: string, from: IRExpr,
  blockedBy?: "any" | "enemy" | "friendly" | "none",
  src?: SourceRef,
): IRSelector {
  return { kind: "bishopRayCells", board, from, blockedBy,
           irType: { kind: "selector", of: "cell" }, src };
}

export function rayCells(
  board: string, from: IRExpr,
  dx: number, dy: number,
  opts?: { maxSteps?: number; blockedBy?: "any" | "enemy" | "friendly" | "none" },
  src?: SourceRef,
): IRSelector {
  return { kind: "rayCells", board, from, dx, dy, ...opts,
           irType: { kind: "selector", of: "cell" }, src };
}

export function connectedGroup(
  board: string, from: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "connectedGroup", board, from, ...opts,
           irType: { kind: "selector", of: "cell" }, src };
}

export function explicitCells(coords: string[], src?: SourceRef): IRSelector {
  return { kind: "explicitCells", coords, irType: { kind: "selector", of: "cell" }, src };
}

export function cellsInZone(board: string, zone: string, src?: SourceRef): IRSelector {
  return { kind: "cellsInZone", board, zone, irType: { kind: "selector", of: "cell" }, src };
}

export function captureRay(
  board: string, from: IRExpr,
  dx: number, dy: number,
  through: IRExpr, anchor: IRExpr,
  src?: SourceRef,
): IRSelector {
  return { kind: "captureRay", board, from, dx, dy, through, anchor,
           irType: { kind: "selector", of: "cell" }, src };
}

export function allPieces(
  board: string,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "allPieces", board, ...opts, irType: { kind: "selector", of: "piece" }, src };
}

export function piecesAtCell(
  cell: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "piecesAtCell", cell, ...opts, irType: { kind: "selector", of: "piece" }, src };
}

export function allPlayers(src?: SourceRef): IRSelector {
  return { kind: "allPlayers", irType: { kind: "selector", of: "player" }, src };
}

/** Filter a selector by a predicate.  Inside `where`, `binding` is the candidate. */
export function filter(
  from: IRSelector,
  binding: string,
  where: IRPredicate,
  src?: SourceRef,
): IRSelector {
  return { kind: "filter", from, binding, where,
           irType: from.irType, src };
}

/** Filter to only cells in the selector that are empty. */
export function filterEmpty(from: IRSelector, src?: SourceRef): IRSelector {
  // Pick a binding name that can't conflict with user variables
  const b = "__c";
  return filter(from, b, isEmpty($( b)), src);
}

export function union(of: IRSelector[], src?: SourceRef): IRSelector {
  if (of.length === 0) throw new Error("union requires at least one selector");
  return { kind: "union", of, irType: of[0].irType, src };
}

export function intersection(of: IRSelector[], src?: SourceRef): IRSelector {
  if (of.length === 0) throw new Error("intersection requires at least one selector");
  return { kind: "intersection", of, irType: of[0].irType, src };
}

export function difference(from: IRSelector, exclude: IRSelector, src?: SourceRef): IRSelector {
  return { kind: "difference", from, exclude, irType: from.irType, src };
}

// ─── Predicate builders ───────────────────────────────────────────────────────

export function exists(sel: IRSelector, src?: SourceRef): IRPredicate {
  return { kind: "exists", in: sel, irType: "bool", src };
}

export function forAll(sel: IRSelector, binding: string, where: IRPredicate, src?: SourceRef): IRPredicate {
  return { kind: "forAll", in: sel, binding, where, irType: "bool", src };
}

export function countCompare(
  sel: IRSelector,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=",
  value: IRExpr,
  src?: SourceRef,
): IRPredicate {
  return { kind: "countCompare", of: sel, op, value, irType: "bool", src };
}

export function isEmpty(cell: IRExpr, src?: SourceRef): IRPredicate {
  return { kind: "isEmpty", cell, irType: "bool", src };
}

export function isOccupied(cell: IRExpr, src?: SourceRef): IRPredicate {
  return { kind: "isOccupied", cell, irType: "bool", src };
}

export function hasPiece(
  cell: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRPredicate {
  return { kind: "hasPiece", cell, ...opts, irType: "bool", src };
}

export function boardFull(board: string, src?: SourceRef): IRPredicate {
  return { kind: "boardFull", board, irType: "bool", src };
}

export function boardEmpty(board: string, src?: SourceRef): IRPredicate {
  return { kind: "boardEmpty", board, irType: "bool", src };
}

export function distanceMatches(
  from: IRExpr, to: IRExpr,
  metric: "king" | "manhattan",
  mode: "exactly" | "atMost" | "atLeast",
  value: number,
  src?: SourceRef,
): IRPredicate {
  return { kind: "distanceMatches", from, to, metric, mode, value, irType: "bool", src };
}

export function groupHasLiberty(cell: IRExpr, board: string, opts?: { pieceType?: string }, src?: SourceRef): IRPredicate {
  return { kind: "groupHasLiberty", cell, board, ...opts, irType: "bool", src };
}

export function connects(board: string, owner: IRExpr, fromZone: string, toZone: string, src?: SourceRef): IRPredicate {
  return { kind: "connects", board, owner, fromZone, toZone, irType: "bool", src };
}

export function hasLegalAction(player: IRExpr, actions: string[], src?: SourceRef): IRPredicate {
  return { kind: "hasLegalAction", player, actions, irType: "bool", src };
}

export function equals(left: IRExpr, right: IRExpr, src?: SourceRef): IRPredicate {
  return { kind: "equals", left, right, irType: "bool", src };
}

export function compare(
  left: IRExpr,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=",
  right: IRExpr,
  src?: SourceRef,
): IRPredicate {
  return { kind: "compare", left, op, right, irType: "bool", src };
}

export function not(of: IRPredicate, src?: SourceRef): IRPredicate {
  return { kind: "not", of, irType: "bool", src };
}

export function and(of: IRPredicate[], src?: SourceRef): IRPredicate {
  if (of.length === 1) return of[0];
  return { kind: "and", of, irType: "bool", src };
}

export function or(of: IRPredicate[], src?: SourceRef): IRPredicate {
  if (of.length === 1) return of[0];
  return { kind: "or", of, irType: "bool", src };
}

// ─── Effect builders ──────────────────────────────────────────────────────────

/** Sequence a list of effects in order. Flattens single-element lists. */
export function seq(effects: IREffect[], src?: SourceRef): IREffect {
  if (effects.length === 1) return effects[0];
  return { kind: "sequence", effects, irType: "effect", src };
}

export function when(condition: IRPredicate, then: IREffect, elseBranch?: IREffect, src?: SourceRef): IREffect {
  return { kind: "if", condition, then, else: elseBranch, irType: "effect", src };
}

export function forEach(sel: IRSelector, binding: string, body: IREffect, src?: SourceRef): IREffect {
  return { kind: "forEach", in: sel, binding, do: body, irType: "effect", src };
}

export function placePiece(pieceType: string, owner: IRExpr, at: IRExpr, src?: SourceRef): IREffect {
  return { kind: "placePiece", pieceType, owner, at, irType: "effect", src };
}

export function removePiece(at: IRExpr, src?: SourceRef): IREffect {
  return { kind: "removePiece", at, irType: "effect", src };
}

export function movePiece(from: IRExpr, to: IRExpr, src?: SourceRef): IREffect {
  return { kind: "movePiece", from, to, irType: "effect", src };
}

export function setPieceOwner(at: IRExpr, owner: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setPieceOwner", at, owner, irType: "effect", src };
}

export function convertPieces(sel: IRSelector, toOwner: IRExpr, src?: SourceRef): IREffect {
  return { kind: "convertPieces", in: sel, toOwner, irType: "effect", src };
}

export function addScore(player: IRExpr, amount: IRExpr, src?: SourceRef): IREffect {
  return { kind: "addScore", player, amount, irType: "effect", src };
}

export function setScore(player: IRExpr, amount: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setScore", player, amount, irType: "effect", src };
}

export function setVar(name: string, value: IRExpr | null, src?: SourceRef): IREffect {
  return { kind: "setVar", name, value, irType: "effect", src };
}

export function incrementVar(name: string, by?: number, src?: SourceRef): IREffect {
  return { kind: "incrementVar", name, by, irType: "effect", src };
}

export function advanceTurn(src?: SourceRef): IREffect {
  return { kind: "advanceTurn", irType: "effect", src };
}

export function setNextPlayer(player: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setNextPlayer", player, irType: "effect", src };
}

// ─── Named definition helper ──────────────────────────────────────────────────

/**
 * Attach a name and explanation to an IR node, creating a named definition.
 * The definition is added to the game's `definitions` array automatically
 * when you pass it to `IRGame.definitions`.
 *
 * Importantly, `define()` does NOT change the node itself — it just sets the
 * `src` field so the IR printer can show the name and explain string.
 * The returned value IS the original node (not a wrapper).
 */
export function define<T extends IRSelector | IRPredicate | IREffect>(
  node: T,
  meta: { name: string; explain?: string; module?: string },
): T & { _def: IRDefinition } {
  const src: SourceRef = {
    module: meta.module ?? "game",
    definition: meta.name,
    explain: meta.explain,
  };
  const tagged = { ...node, src } as T & { _def: IRDefinition };
  Object.defineProperty(tagged, "_def", {
    value: { name: meta.name, value: node, explain: meta.explain, module: meta.module } satisfies IRDefinition,
    enumerable: false,  // don't pollute JSON serialization
  });
  return tagged;
}

/** Extract the IRDefinition from a node created by define(). */
export function getDef(node: object): IRDefinition | undefined {
  return (node as Record<string, unknown>)["_def"] as IRDefinition | undefined;
}
