/**
 * §11 — Compiled runtime plan.
 *
 * compile(IRGame) → CompiledRuleset: a flat, JSON-serializable, fully-annotated
 * representation of a game. It sits between the IR (recursive expression trees)
 * and the runtime state (GridState). Key properties:
 *
 *   - Pure data: no function values, safe to JSON.stringify / transfer
 *   - Pre-computed: setup positions extracted from IR effects at compile time
 *   - Typed opcodes: every action, end condition, and result is a tagged record
 *   - Traceable: human-readable explain strings preserved throughout
 *
 * The CompiledRuleset is what the Plan tab shows for IR-mode games.
 * The IRGameRuntime interprets the original IRGame; a future optimised runtime
 * would interpret CompiledRuleset directly.
 */

import type {
  IRGame,
  IREffect,
  IRAction,
  IREndCondition,
  IRResultRule,
  IRSelector,
  IRPredicate,
} from "./types";

// ─── Compiled sub-types ───────────────────────────────────────────────────────

export interface CompiledBoard {
  id: string;
  width: number;
  height: number;
  coordinates: "algebraic" | "numeric";
  totalCells: number;
  zones?: Record<string, string[]>;
}

export interface CompiledPieceType {
  id: string;
  capturedAs: "remove" | "convert" | "toReserve";
  stacking: "single" | "stack";
  value?: number;
}

export interface CompiledVar {
  name: string;
  type: "int" | "bool" | "cell" | "player";
  initial: number | boolean | string | null;
}

/** A single placement that occurs during game setup. */
export interface PlacementOp {
  pieceType: string;
  owner: string;   // player name
  cell: string;    // board coordinate
}

/** Compiled view of one action binding. */
export interface CompiledBinding {
  name: string;
  explain?: string;
  /** Concise tag describing the domain (e.g. "ownPiece", "emptyCell", "anyCell"). */
  domain: string;
}

/** Compiled view of one action. */
export interface CompiledActionDef {
  id: string;
  label: string;
  bindings: CompiledBinding[];
  /** Readable description of the allowedWhen guard, if present. */
  allowedWhen?: string;
  /** Readable description of the per-binding condition, if present. */
  condition?: string;
  /** Top-level explain string from the action definition. */
  explain?: string;
  /** Tags describing each effect category (deduplicated). */
  effectTags: EffectTag[];
}

export type EffectTag =
  | "placePiece"
  | "removePiece"
  | "movePiece"
  | "convertPieces"
  | "setPieceOwner"
  | "addScore"
  | "setScore"
  | "setVar"
  | "advanceTurn"
  | "setNextPlayer";

/** Compiled view of one end condition. */
export interface CompiledEndConditionDef {
  id: string;
  explain?: string;
  /** Tags describing what the condition checks. */
  conditionTags: ConditionTag[];
}

export type ConditionTag =
  | "boardFull"
  | "boardEmpty"
  | "noLegalMoves"
  | "pieceCount"
  | "connects"
  | "groupNoLiberty"
  | "custom";

/** The compiled result rule. */
export type CompiledResult =
  | { kind: "maxPieceCount"; pieceType: string; tie: "draw" | "sharedWin" }
  | { kind: "maxScore";      tie: "draw" }
  | { kind: "minScore";      tie: "draw" }
  | { kind: "lastMoverLoses" }
  | { kind: "firstMatch"; cases: Array<{ explain?: string }> };

// ─── Top-level compiled type ──────────────────────────────────────────────────

/**
 * The compiled runtime plan for one game.
 *
 * This is the authoritative JSON-serializable description of a game's rules.
 * It is produced once from IRGame and consumed by the Plan tab and (in future)
 * by an optimised runtime.
 */
export interface CompiledRuleset {
  // ── Identity ────────────────────────────────────────────────────────────────
  id: string;
  name: string;
  description?: string;
  version: number;
  modules: string[];

  // ── Structure ───────────────────────────────────────────────────────────────
  board: CompiledBoard;
  players: string[];
  pieceTypes: CompiledPieceType[];
  vars: CompiledVar[];

  // ── Pre-computed initial state ───────────────────────────────────────────────
  setup: PlacementOp[];

  // ── Rules ───────────────────────────────────────────────────────────────────
  actions: CompiledActionDef[];
  endConditions: CompiledEndConditionDef[];
  result: CompiledResult;
}

// ─── Compile function ─────────────────────────────────────────────────────────

export function compile(game: IRGame): CompiledRuleset {
  return {
    id:          game.id,
    name:        game.name,
    description: game.description,
    version:     game.version,
    modules:     game.modules,
    board:       compileBoard(game),
    players:     game.players,
    pieceTypes:  game.pieceTypes.map(compilePieceType),
    vars:        game.vars.map(compileVar),
    setup:       extractSetup(game),
    actions:     game.actions.map((a) => compileAction(a, game.players)),
    endConditions: game.endConditions.map(compileEndCondition),
    result:      compileResult(game.result),
  };
}

// ─── Board ────────────────────────────────────────────────────────────────────

function compileBoard(game: IRGame): CompiledBoard {
  return {
    id:          game.board.id,
    width:       game.board.width,
    height:      game.board.height,
    coordinates: game.board.coordinates,
    totalCells:  game.board.width * game.board.height,
    zones:       game.board.zones,
  };
}

// ─── Piece types ──────────────────────────────────────────────────────────────

function compilePieceType(pt: IRGame["pieceTypes"][number]): CompiledPieceType {
  const out: CompiledPieceType = {
    id:          pt.id,
    capturedAs:  pt.capturedAs,
    stacking:    pt.stacking,
  };
  if (pt.value !== undefined) out.value = pt.value;
  return out;
}

// ─── Vars ─────────────────────────────────────────────────────────────────────

function compileVar(v: IRGame["vars"][number]): CompiledVar {
  return { name: v.name, type: v.type, initial: v.initial };
}

// ─── Setup — walk effects and extract literal placePiece calls ────────────────

function extractSetup(game: IRGame): PlacementOp[] {
  const ops: PlacementOp[] = [];
  for (const eff of game.setup) {
    collectPlacePiece(eff, game.players, ops);
  }
  return ops;
}

function collectPlacePiece(eff: IREffect, players: string[], out: PlacementOp[]): void {
  if (eff.kind === "sequence") {
    for (const e of eff.effects) collectPlacePiece(e, players, out);
    return;
  }
  if (eff.kind === "if") {
    collectPlacePiece(eff.then, players, out);
    if (eff.else) collectPlacePiece(eff.else, players, out);
    return;
  }
  if (eff.kind === "forEach") {
    collectPlacePiece(eff.do, players, out);
    return;
  }
  if (eff.kind === "placePiece") {
    const cell  = eff.at.kind    === "lit" ? String(eff.at.value)    : null;
    const owner = eff.owner.kind === "lit" ? String(eff.owner.value)  :
                  eff.owner.kind === "global" && eff.owner.name === "currentPlayer" ? players[0] :
                  null;
    if (cell && owner) out.push({ pieceType: eff.pieceType, owner, cell });
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function compileAction(action: IRAction, players: string[]): CompiledActionDef {
  return {
    id:          action.id,
    label:       action.label,
    bindings:    action.bindings.map((b) => ({
      name:    b.name,
      explain: b.explain,
      domain:  classifySelector(b.from),
    })),
    allowedWhen: action.allowedWhen ? classifyPredicate(action.allowedWhen, players) : undefined,
    condition:   action.condition   ? classifyPredicate(action.condition,   players) : undefined,
    explain:     action.explain,
    effectTags:  collectEffectTags(action.effects),
  };
}

/** Return a short human-readable tag for the selector's domain. */
function classifySelector(sel: IRSelector): string {
  switch (sel.kind) {
    case "allCells":          return "anyCell";
    case "emptyCells":        return "emptyCell";
    case "allPieces":         return sel.owner ? "ownPiece" : "anyPiece";
    case "piecesAtCell":      return "pieceAtCell";
    case "cellsAtDistance":   return `cellsWithin${sel.value}${sel.metric === "king" ? "King" : "Manhattan"}`;
    case "captureRay":        return "captureRay";
    case "rookRayCells":      return "rookRay";
    case "bishopRayCells":    return "bishopRay";
    case "rayCells":          return `ray(${sel.dx},${sel.dy})`;
    case "connectedGroup":    return "connectedGroup";
    case "filter":            return `filtered(${classifySelector(sel.from)})`;
    case "union":             return "union";
    case "intersection":      return "intersection";
    case "difference":        return "difference";
    case "explicitCells":     return `explicit(${sel.coords.length}cells)`;
    case "cellsInZone":       return `zone:${sel.zone}`;
    case "allPlayers":        return "players";
  }
}

/** Return a short human-readable description of a predicate. */
function classifyPredicate(pred: IRPredicate, players: string[]): string {
  switch (pred.kind) {
    case "true":              return "always";
    case "false":             return "never";
    case "isEmpty":           return "cellEmpty";
    case "isOccupied":        return "cellOccupied";
    case "hasPiece":          return pred.owner ? "hasFriendlyPiece" : "hasPiece";
    case "boardFull":         return "boardFull";
    case "boardEmpty":        return "boardEmpty";
    case "distanceMatches":   return `distance${pred.mode}${pred.value}`;
    case "exists":            return `exists(${classifySelector(pred.in)})`;
    case "forAll":            return `forAll(${classifySelector(pred.in)})`;
    case "countCompare":      return `count${pred.op}${pred.value.kind === "lit" ? pred.value.value : "?"}`;
    case "equals":            return "equals";
    case "compare":           return `compare${pred.op}`;
    case "hasLegalAction":    return `hasLegalAction(${pred.actions.join(",")})`;
    case "groupHasLiberty":   return "groupHasLiberty";
    case "connects":          return `connects(${pred.fromZone}→${pred.toZone})`;
    case "not":               return `not(${classifyPredicate(pred.of, players)})`;
    case "and":               return `and(${pred.of.map((p) => classifyPredicate(p, players)).join(",")})`;
    case "or":                return `or(${pred.of.map((p) => classifyPredicate(p, players)).join(",")})`;
  }
}

/** Collect the set of distinct effect opcodes used by an effect tree. */
function collectEffectTags(eff: IREffect): EffectTag[] {
  const tags = new Set<EffectTag>();
  walkEffectTags(eff, tags);
  return [...tags];
}

function walkEffectTags(eff: IREffect, out: Set<EffectTag>): void {
  switch (eff.kind) {
    case "sequence":      for (const e of eff.effects) walkEffectTags(e, out); break;
    case "if":            walkEffectTags(eff.then, out); if (eff.else) walkEffectTags(eff.else, out); break;
    case "forEach":       walkEffectTags(eff.do, out); break;
    case "advanceTurn":   out.add("advanceTurn"); break;
    case "setNextPlayer": out.add("setNextPlayer"); break;
    case "placePiece":    out.add("placePiece"); break;
    case "removePiece":   out.add("removePiece"); break;
    case "movePiece":     out.add("movePiece"); break;
    case "setPieceOwner": out.add("setPieceOwner"); break;
    case "convertPieces": out.add("convertPieces"); break;
    case "addScore":      out.add("addScore"); break;
    case "setScore":      out.add("setScore"); break;
    case "setVar":        out.add("setVar"); break;
    case "incrementVar":  out.add("setVar"); break;
  }
}

// ─── End conditions ───────────────────────────────────────────────────────────

function compileEndCondition(ec: IREndCondition): CompiledEndConditionDef {
  return {
    id:            ec.id,
    explain:       ec.explain,
    conditionTags: collectConditionTags(ec.when),
  };
}

function collectConditionTags(pred: IRPredicate): ConditionTag[] {
  const tags = new Set<ConditionTag>();
  walkConditionTags(pred, tags);
  return tags.size > 0 ? [...tags] : ["custom"];
}

function walkConditionTags(pred: IRPredicate, out: Set<ConditionTag>): void {
  switch (pred.kind) {
    case "boardFull":       out.add("boardFull"); break;
    case "boardEmpty":      out.add("boardEmpty"); break;
    case "hasLegalAction":  out.add("noLegalMoves"); break;
    case "countCompare":    out.add("pieceCount"); break;
    case "exists":          walkSelectorConditionTags(pred.in, out); break;
    case "connects":        out.add("connects"); break;
    case "groupHasLiberty": out.add("groupNoLiberty"); break;
    case "not":             walkConditionTags(pred.of, out); break;
    case "and":             for (const p of pred.of) walkConditionTags(p, out); break;
    case "or":              for (const p of pred.of) walkConditionTags(p, out); break;
    default:                break;
  }
}

function walkSelectorConditionTags(sel: IRSelector, out: Set<ConditionTag>): void {
  if (sel.kind === "allPieces" || sel.kind === "piecesAtCell") out.add("pieceCount");
  if (sel.kind === "filter") walkSelectorConditionTags(sel.from, out);
}

// ─── Result ───────────────────────────────────────────────────────────────────

function compileResult(r: IRResultRule): CompiledResult {
  if (r.kind === "maxPieceCount") return { kind: "maxPieceCount", pieceType: r.pieceType, tie: r.tie };
  if (r.kind === "maxScore")       return { kind: "maxScore",       tie: "draw" };
  if (r.kind === "minScore")       return { kind: "minScore",       tie: "draw" };
  if (r.kind === "lastMoverLoses") return { kind: "lastMoverLoses" };
  // firstMatch
  return {
    kind:  "firstMatch",
    cases: r.cases.map((c) => ({ explain: c.explain })),
  };
}
