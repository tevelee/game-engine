/**
 * rules.kernel.v1 — builder functions for the abstract execution model.
 *
 * The kernel knows about expressions, selectors, predicates, effects, and
 * named definitions. It does NOT know about grids, pieces, players, cards,
 * dice, or any specific game concept — those live in the standard library.
 */

import type {
  IRType, SourceRef,
  IRExpr, IRSelector, IRPredicate, IREffect, IRDefinition,
} from "../ir/types";

export const KERNEL_MODULE = "rules.kernel.v1";

// ─── Expression builders ──────────────────────────────────────────────────────

/** Reference a binding variable: $("source"), $("target"), $("cell") */
export function $(name: string): IRExpr {
  return { kind: "var", name, irType: "cell" };  // irType refined by context
}

/** Literal value: lit("a1"), lit(42), lit(true), lit(null) */
export function lit(value: null | boolean | number | string): IRExpr {
  const irType: IRType =
    value === null              ? "void"   :
    typeof value === "boolean"  ? "bool"   :
    typeof value === "number"   ? "int"    : "cell";
  return { kind: "lit", value, irType };
}

/** Named global variable: global("consecutivePasses") */
export function global(name: string, irType: IRType = "player"): IRExpr {
  return { kind: "global", name, irType };
}

// ─── Selector combinators ─────────────────────────────────────────────────────

/** Filter a selector by a predicate.  Inside `where`, `binding` is the candidate. */
export function filter(
  from: IRSelector,
  binding: string,
  where: IRPredicate,
  src?: SourceRef,
): IRSelector {
  return { kind: "filter", from, binding, where, irType: from.irType, src };
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

export function setVar(name: string, value: IRExpr | null, src?: SourceRef): IREffect {
  return { kind: "setVar", name, value, irType: "effect", src };
}

export function incrementVar(name: string, by?: number, src?: SourceRef): IREffect {
  return { kind: "incrementVar", name, by, irType: "effect", src };
}

export function addScore(player: IRExpr, amount: IRExpr, src?: SourceRef): IREffect {
  return { kind: "addScore", player, amount, irType: "effect", src };
}

export function setScore(player: IRExpr, amount: IRExpr, src?: SourceRef): IREffect {
  return { kind: "setScore", player, amount, irType: "effect", src };
}

// ─── Named definition helper ──────────────────────────────────────────────────

/**
 * Attach a name and explanation to any IR node, creating a named definition.
 * The returned value IS the original node (not a wrapper) — `define()` only
 * sets the `src` field and attaches an invisible `_def` property.
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
    enumerable: false,
  });
  return tagged;
}

/** Extract the IRDefinition from a node created by define(). */
export function getDef(node: object): IRDefinition | undefined {
  return (node as Record<string, unknown>)["_def"] as IRDefinition | undefined;
}
