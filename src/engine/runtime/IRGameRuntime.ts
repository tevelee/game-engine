/**
 * IRGameRuntime — a GameRuntime that interprets an IRGame directly.
 *
 * This is the interpreter layer: it evaluates IRSelectors, IRPredicates, and
 * IREffects against a GridState at runtime. No separate compile step is needed.
 *
 * Scope: supports everything Ataxx requires, plus the building blocks for richer
 * games (rayCells, connectedGroup, hasLegalAction recursion, etc.). Unimplemented
 * nodes throw descriptive errors so gaps are visible immediately.
 */

import type {
  GridState, ActionInstance, ValidationResult, ApplyResult,
  ActionTrace, BindingTraceEntry, EffectTraceEntry, EndConditionTraceEntry,
  Outcome, GameEvent, ReplayResult, GameRuntime, CellChange,
} from "../../rules/core/types";
import { coordToIndex, indexToCoord } from "../../rules/core/coordinates";
import { hashState } from "../../rules/core/hashing";
import type {
  IRGame, IRAction, IRExpr, IRSelector, IRPredicate, IREffect,
} from "../ir/types";

// ─── Evaluation context ───────────────────────────────────────────────────────

interface EvalCtx {
  cells: Int8Array;
  currentPlayerIdx: number;   // 0 or 1
  turnNumber: number;
  bindings: Record<string, unknown>; // name → coord string | number | boolean | null
  scores: number[];           // per-player score, indexed by player index
  vars: Record<string, number | boolean | string | null>; // named game variables
}

// ─── IRGameRuntime ────────────────────────────────────────────────────────────

export class IRGameRuntime implements GameRuntime {
  private game: IRGame;
  private width: number;
  private height: number;
  private totalCells: number;
  // Guards against infinite recursion in hasLegalAction → legalActions → hasLegalAction
  private _hasLegalActionDepth = 0;

  constructor(game: IRGame) {
    this.game = game;
    this.width = game.board.width;
    this.height = game.board.height;
    this.totalCells = game.board.width * game.board.height;
  }

  // ─── GameRuntime interface ────────────────────────────────────────────────

  initialState(): GridState {
    const cells = new Int8Array(this.totalCells).fill(-1);
    const scores = new Array<number>(this.game.players.length).fill(0);
    const vars: Record<string, number | boolean | string | null> = {};
    for (const v of this.game.vars) vars[v.name] = v.initial;
    const ctx = this.baseCtx(cells, 0, 1, scores, vars);
    for (const eff of this.game.setup) {
      this.execEffect(eff, ctx);
    }
    return { cells: ctx.cells, currentPlayer: 0, turnNumber: 1, scores: ctx.scores, vars: ctx.vars };
  }

  legalActions(state: GridState): ActionInstance[] {
    const result: ActionInstance[] = [];
    const actor = this.game.players[state.currentPlayer];

    for (const action of this.game.actions) {
      const ctx = this.stateCtx(state);

      // Check allowedWhen gate (action-level)
      if (action.allowedWhen && !this.evalPredicate(action.allowedWhen, ctx)) {
        continue;
      }

      if (action.bindings.length === 0) {
        // No bindings → single no-arg action (e.g. pass)
        if (!action.condition || this.evalPredicate(action.condition, ctx)) {
          result.push({ id: action.id, actor, bindings: {} });
        }
        continue;
      }

      // Enumerate all binding combinations
      for (const bindings of this.enumerateBindings(action, ctx)) {
        const actionCtx = { ...ctx, bindings: { ...ctx.bindings, ...bindings } };
        if (!action.condition || this.evalPredicate(action.condition, actionCtx)) {
          const strBindings: Record<string, string> = {};
          for (const [k, v] of Object.entries(bindings)) {
            strBindings[k] = String(v);
          }
          result.push({ id: action.id, actor, bindings: strBindings });
        }
      }
    }

    return result;
  }

  legalActionsForBinding(
    state: GridState,
    actionId: string,
    partialBindings: Record<string, string>,
  ): string[] {
    const action = this.game.actions.find((a) => a.id === actionId);
    if (!action) return [];

    const ctx = this.stateCtx(state);
    const loadedBindings: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(partialBindings)) {
      loadedBindings[k] = v;
    }

    // Determine next unresolved binding
    const nextBinding = action.bindings.find((b) => !(b.name in partialBindings));
    if (!nextBinding) return [];

    const bindingCtx: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, ...loadedBindings } };
    const candidates = this.evalSelector(nextBinding.from, bindingCtx);
    return candidates.map(String);
  }

  validate(state: GridState, action: ActionInstance): ValidationResult {
    const legal = this.legalActions(state);
    const match = legal.some(
      (a) =>
        a.id === action.id &&
        JSON.stringify(a.bindings) === JSON.stringify(action.bindings),
    );
    return match
      ? { valid: true, errors: [] }
      : { valid: false, errors: [`Action ${action.id} with given bindings is not legal.`] };
  }

  apply(state: GridState, action: ActionInstance): ApplyResult {
    const prevHash = this.hash(state);
    const trace = this.explain(state, action);

    const newCells = new Int8Array(state.cells);
    for (const et of trace.effectTrace) {
      for (const ch of et.cellChanges) {
        const idx = coordToIndex(ch.cell, this.width);
        newCells[idx] = this.ownerToInt(ch.after);
      }
    }

    // Determine next player / turn from trace (advanceTurn was executed)
    const actionDef = this.game.actions.find((a) => a.id === action.id)!;
    const advanced = this.effectHasAdvanceTurn(actionDef.effects);

    let nextPlayer = state.currentPlayer;
    let nextTurn = state.turnNumber;
    if (advanced) {
      nextPlayer = (1 - state.currentPlayer) as 0 | 1;
      nextTurn = state.turnNumber + 1;
    }

    const newScores = trace.finalScores ?? state.scores?.slice() ?? new Array(this.game.players.length).fill(0);
    const newVars   = trace.finalVars   ?? { ...(state.vars ?? {}) };

    const newState: GridState = {
      cells: newCells,
      currentPlayer: nextPlayer,
      turnNumber: nextTurn,
      scores: newScores,
      vars: newVars,
    };
    const nextHash = this.hash(newState);

    const event: GameEvent = {
      type: "actionAccepted",
      turn: state.turnNumber,
      actor: action.actor,
      action,
      previousStateHash: prevHash,
      nextStateHash: nextHash,
      scores: newScores.slice(),
    };

    return { state: newState, trace, event };
  }

  outcome(state: GridState): Outcome | null {
    const ctx = this.stateCtx(state);
    for (const ec of this.game.endConditions) {
      if (this.evalPredicate(ec.when, ctx)) {
        return this.computeResult(state);
      }
    }
    return null;
  }

  explain(state: GridState, action: ActionInstance): ActionTrace {
    const actionDef = this.game.actions.find((a) => a.id === action.id);
    if (!actionDef) throw new Error(`Unknown action: ${action.id}`);

    const ctx = this.stateCtx(state);
    const bindingTrace: BindingTraceEntry[] = [];
    const loadedBindings: Record<string, unknown> = {};

    for (const binding of actionDef.bindings) {
      const bindingCtx: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, ...loadedBindings } };
      const candidates = this.evalSelector(binding.from, bindingCtx).map(String);
      const selected = action.bindings[binding.name] ?? "";
      loadedBindings[binding.name] = selected;

      bindingTrace.push({
        binding: binding.name,
        explanation: binding.explain ?? `Choose ${binding.name}`,
        candidates,
        selected,
      });
    }

    // Execute effects on a working copy of cells/scores/vars
    const workingCells = new Int8Array(state.cells);
    const workingScores = (state.scores ?? new Array<number>(this.game.players.length).fill(0)).slice();
    const workingVars: Record<string, number | boolean | string | null> = { ...(state.vars ?? {}) };
    const effectCtx: EvalCtx = {
      cells: workingCells,
      currentPlayerIdx: state.currentPlayer,
      turnNumber: state.turnNumber,
      bindings: { ...ctx.bindings, ...loadedBindings },
      scores: workingScores,
      vars: workingVars,
    };

    const effectTrace: EffectTraceEntry[] = [];
    this.traceEffect(actionDef.effects, effectCtx, effectTrace);

    const endConditionTrace: EndConditionTraceEntry[] = this.game.endConditions.map((ec) => {
      const postCtx: EvalCtx = { ...effectCtx, cells: workingCells };
      return { id: ec.id, result: this.evalPredicate(ec.when, postCtx) };
    });

    return {
      action: action.id,
      actor: action.actor,
      bindings: action.bindings,
      bindingTrace,
      effectTrace,
      endConditionTrace,
      finalScores: workingScores.slice(),
      finalVars: { ...workingVars },
    };
  }

  hash(state: GridState): string {
    return hashState(state);
  }

  replay(events: GameEvent[]): ReplayResult {
    const states: GridState[] = [this.initialState()];
    let current = states[0];
    for (const event of events) {
      const result = this.apply(current, event.action);
      current = result.state;
      states.push(current);
    }
    return { states, events, outcome: this.outcome(current) };
  }

  // ─── Binding enumeration ──────────────────────────────────────────────────

  private enumerateBindings(
    action: IRAction,
    ctx: EvalCtx,
  ): Array<Record<string, unknown>> {
    let results: Array<Record<string, unknown>> = [{}];

    for (const binding of action.bindings) {
      const next: Array<Record<string, unknown>> = [];
      for (const partial of results) {
        const bindingCtx: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, ...partial } };
        const candidates = this.evalSelector(binding.from, bindingCtx);
        for (const c of candidates) {
          next.push({ ...partial, [binding.name]: c });
        }
      }
      results = next;
    }

    return results;
  }

  // ─── Expression evaluator ─────────────────────────────────────────────────

  private evalExpr(expr: IRExpr, ctx: EvalCtx): unknown {
    switch (expr.kind) {
      case "lit":
        return expr.value;

      case "var": {
        const val = ctx.bindings[expr.name];
        if (val === undefined) throw new Error(`Unbound variable: ${expr.name}`);
        return val;
      }

      case "global":
        switch (expr.name) {
          case "currentPlayer": return ctx.currentPlayerIdx;
          case "opponent":      return 1 - ctx.currentPlayerIdx;
          case "turnNumber":    return ctx.turnNumber;
          default:
            if (expr.name in ctx.vars) return ctx.vars[expr.name];
            throw new Error(`Unknown global: ${expr.name}`);
        }

      case "field":
        throw new Error(`field expressions not yet supported`);
    }
  }

  // ─── Selector evaluator → returns array of cell coords | player indices ──

  evalSelector(sel: IRSelector, ctx: EvalCtx): unknown[] {
    switch (sel.kind) {
      case "allCells":
        return this.allCells();

      case "emptyCells":
        return this.allCells().filter((coord) => {
          const idx = coordToIndex(coord as string, this.width);
          return ctx.cells[idx] === -1;
        });

      case "allPlayers":
        return [0, 1].slice(0, this.game.players.length);

      case "allPieces": {
        const result: string[] = [];
        for (let i = 0; i < this.totalCells; i++) {
          const owner = ctx.cells[i];
          if (owner === -1) continue;
          if (sel.pieceType !== undefined && !this.hasPieceType(sel.pieceType)) continue;
          if (sel.owner !== undefined) {
            const wantOwner = this.evalExpr(sel.owner, ctx) as number;
            if (owner !== wantOwner) continue;
          }
          result.push(indexToCoord(i, this.width));
        }
        return result;
      }

      case "piecesAtCell": {
        const coord = this.evalExpr(sel.cell, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        const owner = ctx.cells[idx];
        if (owner === -1) return [];
        if (sel.owner !== undefined) {
          const wantOwner = this.evalExpr(sel.owner, ctx) as number;
          if (owner !== wantOwner) return [];
        }
        return [coord];  // single-piece-per-cell model
      }

      case "explicitCells":
        return sel.coords;

      case "cellsInZone":
        return (this.game.board.zones ?? {})[sel.zone] ?? [];

      case "captureRay": {
        const fromCoord = this.evalExpr(sel.from, ctx) as string;
        const fromIdx   = coordToIndex(fromCoord, this.width);
        const throughOwner = this.evalExpr(sel.through, ctx) as number;
        const anchorOwner  = this.evalExpr(sel.anchor,  ctx) as number;
        const { dx, dy } = sel;
        const captured: string[] = [];
        let col = (fromIdx % this.width) + dx;
        let row = Math.floor(fromIdx / this.width) + dy;
        while (col >= 0 && col < this.width && row >= 0 && row < this.height) {
          const idx = row * this.width + col;
          const owner = ctx.cells[idx];
          if (owner === throughOwner) {
            captured.push(indexToCoord(idx, this.width));
          } else if (owner === anchorOwner && captured.length > 0) {
            return captured;  // sandwiched — return the captured cells
          } else {
            break;  // empty cell or wrong piece — no capture in this direction
          }
          col += dx;
          row += dy;
        }
        return [];  // ray ended without finding anchor
      }

      case "cellsAtDistance": {
        const fromCoord = this.evalExpr(sel.from, ctx) as string;
        const fromIdx = coordToIndex(fromCoord, this.width);
        const result: string[] = [];
        for (let i = 0; i < this.totalCells; i++) {
          if (i === fromIdx) continue;
          const dist = this.distance(fromIdx, i, sel.metric);
          if (this.compareMode(dist, sel.mode, sel.value)) {
            result.push(indexToCoord(i, this.width));
          }
        }
        return result;
      }

      case "rookRayCells":
      case "bishopRayCells":
      case "rayCells": {
        const fromCoord = this.evalExpr(sel.from, ctx) as string;
        const fromIdx = coordToIndex(fromCoord, this.width);
        return this.rayTraversal(sel, fromIdx, ctx);
      }

      case "connectedGroup": {
        const fromCoord = this.evalExpr(sel.from, ctx) as string;
        const fromIdx = coordToIndex(fromCoord, this.width);
        const owner = sel.owner !== undefined ? this.evalExpr(sel.owner, ctx) as number : ctx.cells[fromIdx];
        return this.floodFill(fromIdx, owner, ctx.cells).map((i) => indexToCoord(i, this.width));
      }

      case "filter": {
        const base = this.evalSelector(sel.from, ctx);
        return base.filter((item) => {
          const inner: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, [sel.binding]: item } };
          return this.evalPredicate(sel.where, inner);
        });
      }

      case "union": {
        const seen = new Set<unknown>();
        const result: unknown[] = [];
        for (const sub of sel.of) {
          for (const item of this.evalSelector(sub, ctx)) {
            if (!seen.has(item)) { seen.add(item); result.push(item); }
          }
        }
        return result;
      }

      case "intersection": {
        const sets = sel.of.map((sub) => new Set(this.evalSelector(sub, ctx)));
        return [...sets[0]].filter((item) => sets.slice(1).every((s) => s.has(item)));
      }

      case "difference": {
        const exclude = new Set(this.evalSelector(sel.exclude, ctx));
        return this.evalSelector(sel.from, ctx).filter((item) => !exclude.has(item));
      }
    }
  }

  // ─── Predicate evaluator ─────────────────────────────────────────────────

  evalPredicate(pred: IRPredicate, ctx: EvalCtx): boolean {
    switch (pred.kind) {
      case "true":  return true;
      case "false": return false;

      case "exists":
        return this.evalSelector(pred.in, ctx).length > 0;

      case "forAll": {
        const items = this.evalSelector(pred.in, ctx);
        return items.every((item) => {
          const inner: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, [pred.binding]: item } };
          return this.evalPredicate(pred.where, inner);
        });
      }

      case "countCompare": {
        const count = this.evalSelector(pred.of, ctx).length;
        const value = this.evalExpr(pred.value, ctx) as number;
        return this.compareOp(count, pred.op, value);
      }

      case "equals": {
        const l = this.evalExpr(pred.left, ctx);
        const r = this.evalExpr(pred.right, ctx);
        return l === r;
      }

      case "compare": {
        const l = this.evalExpr(pred.left, ctx) as number;
        const r = this.evalExpr(pred.right, ctx) as number;
        return this.compareOp(l, pred.op, r);
      }

      case "isEmpty": {
        const coord = this.evalExpr(pred.cell, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        return ctx.cells[idx] === -1;
      }

      case "isOccupied": {
        const coord = this.evalExpr(pred.cell, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        return ctx.cells[idx] !== -1;
      }

      case "hasPiece": {
        const coord = this.evalExpr(pred.cell, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        const owner = ctx.cells[idx];
        if (owner === -1) return false;
        if (pred.owner !== undefined) {
          const wantOwner = this.evalExpr(pred.owner, ctx) as number;
          if (owner !== wantOwner) return false;
        }
        return true;
      }

      case "boardFull":
        return Array.from(ctx.cells).every((c) => c !== -1);

      case "boardEmpty":
        return Array.from(ctx.cells).every((c) => c === -1);

      case "distanceMatches": {
        const fromCoord = this.evalExpr(pred.from, ctx) as string;
        const toCoord   = this.evalExpr(pred.to, ctx) as string;
        const fromIdx   = coordToIndex(fromCoord, this.width);
        const toIdx     = coordToIndex(toCoord, this.width);
        const dist = this.distance(fromIdx, toIdx, pred.metric);
        return this.compareMode(dist, pred.mode, pred.value);
      }

      case "groupHasLiberty": {
        const coord = this.evalExpr(pred.cell, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        const owner = ctx.cells[idx];
        if (owner === -1) return false;
        const group = this.floodFill(idx, owner, ctx.cells);
        return group.some((ci) => this.orthogonalNeighbors(ci).some((ni) => ctx.cells[ni] === -1));
      }

      case "connects": {
        const zones = this.game.board.zones ?? {};
        const fromCells = zones[pred.fromZone] ?? [];
        const toCells   = new Set(zones[pred.toZone] ?? []);
        const ownerIdx  = this.evalExpr(pred.owner, ctx) as number;
        const visited   = new Set<number>();
        const queue: number[] = [];
        for (const coord of fromCells) {
          const idx = coordToIndex(coord, this.width);
          if (ctx.cells[idx] === ownerIdx && !visited.has(idx)) {
            visited.add(idx);
            queue.push(idx);
          }
        }
        while (queue.length > 0) {
          const curr = queue.shift()!;
          if (toCells.has(indexToCoord(curr, this.width))) return true;
          for (const nb of this.orthogonalNeighbors(curr)) {
            if (!visited.has(nb) && ctx.cells[nb] === ownerIdx) {
              visited.add(nb);
              queue.push(nb);
            }
          }
        }
        return false;
      }

      case "hasLegalAction": {
        // Depth guard: break circular hasLegalAction → legalActions → hasLegalAction cycles.
        // At depth >= 2, conservatively return false (no legal actions found in the recursive check).
        // This is correct for all well-formed games where circular guards don't appear.
        if (this._hasLegalActionDepth >= 2) return false;
        this._hasLegalActionDepth++;
        try {
          const playerIdx = this.evalExpr(pred.player, ctx) as number;
          const fakeState: GridState = {
            cells: ctx.cells,
            currentPlayer: playerIdx as 0 | 1,
            turnNumber: ctx.turnNumber,
            scores: ctx.scores,
            vars: ctx.vars,
          };
          const legal = this.legalActions(fakeState);
          return legal.some((a) => pred.actions.includes(a.id));
        } finally {
          this._hasLegalActionDepth--;
        }
      }

      case "not":
        return !this.evalPredicate(pred.of, ctx);

      case "and":
        return pred.of.every((p) => this.evalPredicate(p, ctx));

      case "or":
        return pred.of.some((p) => this.evalPredicate(p, ctx));
    }
  }

  // ─── Effect executor ──────────────────────────────────────────────────────

  private execEffect(eff: IREffect, ctx: EvalCtx): void {
    switch (eff.kind) {
      case "sequence":
        for (const e of eff.effects) this.execEffect(e, ctx);
        break;

      case "if":
        if (this.evalPredicate(eff.condition, ctx)) {
          this.execEffect(eff.then, ctx);
        } else if (eff.else) {
          this.execEffect(eff.else, ctx);
        }
        break;

      case "forEach": {
        const items = this.evalSelector(eff.in, ctx);
        for (const item of items) {
          const inner: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, [eff.binding]: item } };
          this.execEffect(eff.do, inner);
        }
        break;
      }

      case "placePiece": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const owner = this.resolveOwner(eff.owner, ctx);
        const idx = coordToIndex(coord, this.width);
        ctx.cells[idx] = owner;
        break;
      }

      case "removePiece": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        ctx.cells[idx] = -1;
        break;
      }

      case "movePiece": {
        const fromCoord = this.evalExpr(eff.from, ctx) as string;
        const toCoord = this.evalExpr(eff.to, ctx) as string;
        const fromIdx = coordToIndex(fromCoord, this.width);
        const toIdx = coordToIndex(toCoord, this.width);
        ctx.cells[toIdx] = ctx.cells[fromIdx];
        ctx.cells[fromIdx] = -1;
        break;
      }

      case "setPieceOwner": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const owner = this.resolveOwner(eff.owner, ctx);
        const idx = coordToIndex(coord, this.width);
        ctx.cells[idx] = owner;
        break;
      }

      case "convertPieces": {
        const items = this.evalSelector(eff.in, ctx);
        const toOwner = this.resolveOwner(eff.toOwner, ctx);
        for (const coord of items) {
          const idx = coordToIndex(coord as string, this.width);
          if (ctx.cells[idx] !== -1) ctx.cells[idx] = toOwner;
        }
        break;
      }

      case "addScore": {
        const playerIdx = this.resolveOwner(eff.player, ctx);
        const amount = this.evalExpr(eff.amount, ctx) as number;
        ctx.scores[playerIdx] = (ctx.scores[playerIdx] ?? 0) + amount;
        break;
      }

      case "setScore": {
        const playerIdx = this.resolveOwner(eff.player, ctx);
        ctx.scores[playerIdx] = this.evalExpr(eff.amount, ctx) as number;
        break;
      }

      case "setVar":
        ctx.vars[eff.name] = eff.value !== null ? (this.evalExpr(eff.value, ctx) as number | boolean | string | null) : null;
        break;

      case "incrementVar": {
        const cur = (ctx.vars[eff.name] ?? 0) as number;
        ctx.vars[eff.name] = cur + (eff.by ?? 1);
        break;
      }

      case "advanceTurn":
        ctx.currentPlayerIdx = 1 - ctx.currentPlayerIdx;
        ctx.turnNumber += 1;
        break;

      case "setNextPlayer":
        ctx.currentPlayerIdx = this.evalExpr(eff.player, ctx) as number;
        break;
    }
  }

  // ─── Effect tracer (like execEffect but records cell changes) ────────────

  private traceEffect(
    eff: IREffect,
    ctx: EvalCtx,
    trace: EffectTraceEntry[],
  ): void {
    switch (eff.kind) {
      case "sequence":
        for (const e of eff.effects) this.traceEffect(e, ctx, trace);
        break;

      case "if":
        if (this.evalPredicate(eff.condition, ctx)) {
          this.traceEffect(eff.then, ctx, trace);
        } else if (eff.else) {
          this.traceEffect(eff.else, ctx, trace);
        }
        break;

      case "forEach": {
        const items = this.evalSelector(eff.in, ctx);
        for (const item of items) {
          const inner: EvalCtx = { ...ctx, bindings: { ...ctx.bindings, [eff.binding]: item } };
          this.traceEffect(eff.do, inner, trace);
        }
        break;
      }

      case "placePiece": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const owner = this.resolveOwner(eff.owner, ctx);
        const idx = coordToIndex(coord, this.width);
        const before = this.ownerName(ctx.cells[idx]);
        ctx.cells[idx] = owner;
        trace.push({
          effect: "placePiece",
          explanation: `Place ${eff.pieceType} at ${coord} for ${this.game.players[owner]}.`,
          cellChanges: [{ cell: coord, before, after: this.ownerName(owner) }],
        });
        break;
      }

      case "removePiece": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const idx = coordToIndex(coord, this.width);
        const before = this.ownerName(ctx.cells[idx]);
        ctx.cells[idx] = -1;
        trace.push({
          effect: "removePiece",
          explanation: `Remove piece at ${coord}.`,
          cellChanges: [{ cell: coord, before, after: "empty" }],
        });
        break;
      }

      case "movePiece": {
        const fromCoord = this.evalExpr(eff.from, ctx) as string;
        const toCoord = this.evalExpr(eff.to, ctx) as string;
        const fromIdx = coordToIndex(fromCoord, this.width);
        const toIdx = coordToIndex(toCoord, this.width);
        const owner = ctx.cells[fromIdx];
        const beforeTo = this.ownerName(ctx.cells[toIdx]);
        ctx.cells[toIdx] = owner;
        ctx.cells[fromIdx] = -1;
        trace.push({
          effect: "movePiece",
          explanation: `Move piece from ${fromCoord} to ${toCoord}.`,
          cellChanges: [
            { cell: fromCoord, before: this.ownerName(owner), after: "empty" },
            { cell: toCoord, before: beforeTo, after: this.ownerName(owner) },
          ],
        });
        break;
      }

      case "setPieceOwner": {
        const coord = this.evalExpr(eff.at, ctx) as string;
        const owner = this.resolveOwner(eff.owner, ctx);
        const idx = coordToIndex(coord, this.width);
        const before = this.ownerName(ctx.cells[idx]);
        ctx.cells[idx] = owner;
        trace.push({
          effect: "setPieceOwner",
          explanation: `Convert piece at ${coord} to ${this.game.players[owner]}.`,
          cellChanges: [{ cell: coord, before, after: this.ownerName(owner) }],
        });
        break;
      }

      case "convertPieces": {
        const items = this.evalSelector(eff.in, ctx);
        const toOwner = this.resolveOwner(eff.toOwner, ctx);
        const changes: CellChange[] = [];
        for (const coord of items) {
          const idx = coordToIndex(coord as string, this.width);
          if (ctx.cells[idx] !== -1) {
            const before = this.ownerName(ctx.cells[idx]);
            ctx.cells[idx] = toOwner;
            changes.push({ cell: coord as string, before, after: this.ownerName(toOwner) });
          }
        }
        trace.push({
          effect: "convertPieces",
          explanation: `Converted ${changes.length} piece(s) to ${this.game.players[toOwner]}.`,
          cellChanges: changes,
        });
        break;
      }

      case "advanceTurn": {
        const next = this.game.players[1 - ctx.currentPlayerIdx];
        ctx.currentPlayerIdx = 1 - ctx.currentPlayerIdx;
        ctx.turnNumber += 1;
        trace.push({ effect: "advanceTurn", explanation: `Turn advanced to ${capitalize(next)}.`, cellChanges: [] });
        break;
      }

      case "setNextPlayer": {
        const playerIdx = this.evalExpr(eff.player, ctx) as number;
        ctx.currentPlayerIdx = playerIdx;
        trace.push({ effect: "setNextPlayer", explanation: `Next player set to ${this.game.players[playerIdx]}.`, cellChanges: [] });
        break;
      }

      case "addScore": {
        const playerIdx = this.resolveOwner(eff.player, ctx);
        const amount = this.evalExpr(eff.amount, ctx) as number;
        const before = ctx.scores[playerIdx] ?? 0;
        ctx.scores[playerIdx] = before + amount;
        trace.push({
          effect: "addScore",
          explanation: `Add ${amount} to ${this.game.players[playerIdx]}'s score.`,
          cellChanges: [],
          scoreChanges: [{ player: this.game.players[playerIdx], before, after: ctx.scores[playerIdx] }],
        });
        break;
      }

      case "setScore": {
        const playerIdx = this.resolveOwner(eff.player, ctx);
        const before = ctx.scores[playerIdx] ?? 0;
        const after = this.evalExpr(eff.amount, ctx) as number;
        ctx.scores[playerIdx] = after;
        trace.push({
          effect: "setScore",
          explanation: `Set ${this.game.players[playerIdx]}'s score to ${after}.`,
          cellChanges: [],
          scoreChanges: [{ player: this.game.players[playerIdx], before, after }],
        });
        break;
      }

      case "setVar": {
        const before = ctx.vars[eff.name] ?? null;
        const after = eff.value !== null ? (this.evalExpr(eff.value, ctx) as number | boolean | string | null) : null;
        ctx.vars[eff.name] = after;
        trace.push({
          effect: "setVar",
          explanation: `Set ${eff.name} = ${JSON.stringify(after)}.`,
          cellChanges: [],
          varChanges: [{ name: eff.name, before, after }],
        });
        break;
      }

      case "incrementVar": {
        const cur = (ctx.vars[eff.name] ?? 0) as number;
        const after = cur + (eff.by ?? 1);
        ctx.vars[eff.name] = after;
        trace.push({
          effect: "incrementVar",
          explanation: `Increment ${eff.name} by ${eff.by ?? 1} (${cur} → ${after}).`,
          cellChanges: [],
          varChanges: [{ name: eff.name, before: cur, after }],
        });
        break;
      }
    }
  }

  // ─── Result computation ───────────────────────────────────────────────────

  private computeResult(state: GridState): Outcome {
    const r = this.game.result;

    if (r.kind === "maxPieceCount") {
      const counts = this.game.players.map((_, pi) =>
        Array.from(state.cells).filter((c) => c === pi).length,
      );
      const max = Math.max(...counts);
      const winners = this.game.players.filter((_, pi) => counts[pi] === max);
      if (winners.length > 1) {
        return { winner: null, reason: r.tie === "draw" ? "Draw — equal piece counts." : "Shared win." };
      }
      return { winner: winners[0], reason: `${capitalize(winners[0])} wins with ${max} pieces.` };
    }

    if (r.kind === "maxScore" || r.kind === "minScore") {
      const scores = state.scores ?? new Array<number>(this.game.players.length).fill(0);
      const best = r.kind === "maxScore" ? Math.max(...scores) : Math.min(...scores);
      const winners = this.game.players.filter((_, i) => scores[i] === best);
      if (winners.length > 1) return { winner: null, reason: `Draw — equal scores (${best}).` };
      return { winner: winners[0], reason: `${capitalize(winners[0])} wins with score ${best}.` };
    }

    if (r.kind === "lastMoverLoses") {
      return { winner: null, reason: "Last mover loses — result not yet computed." };
    }

    if (r.kind === "firstMatch") {
      const ctx = this.stateCtx(state);
      for (const c of r.cases) {
        if (this.evalPredicate(c.condition, ctx)) {
          const winner = this.evalExpr(c.winner, ctx) as number;
          return { winner: this.game.players[winner], reason: c.explain ?? "First match." };
        }
      }
      return { winner: null, reason: r.else === "draw" ? "Draw." : "No result." };
    }

    return { winner: null, reason: "Unknown result kind." };
  }

  // ─── Spatial helpers ──────────────────────────────────────────────────────

  private allCells(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.totalCells; i++) {
      result.push(indexToCoord(i, this.width));
    }
    return result;
  }

  private distance(a: number, b: number, metric: "king" | "manhattan"): number {
    const af = a % this.width, ar = Math.floor(a / this.width);
    const bf = b % this.width, br = Math.floor(b / this.width);
    const dx = Math.abs(af - bf), dy = Math.abs(ar - br);
    if (metric === "manhattan") return dx + dy;
    return Math.max(dx, dy);  // king = Chebyshev
  }

  private compareMode(actual: number, mode: "exactly" | "atMost" | "atLeast", value: number): boolean {
    if (mode === "exactly") return actual === value;
    if (mode === "atMost")  return actual <= value;
    return actual >= value;
  }

  private compareOp(l: number, op: string, r: number): boolean {
    switch (op) {
      case "==": return l === r;
      case "!=": return l !== r;
      case "<":  return l < r;
      case "<=": return l <= r;
      case ">":  return l > r;
      case ">=": return l >= r;
      default: return false;
    }
  }

  private orthogonalNeighbors(idx: number): number[] {
    const f = idx % this.width, r = Math.floor(idx / this.width);
    const result: number[] = [];
    if (f > 0)              result.push(idx - 1);
    if (f < this.width - 1) result.push(idx + 1);
    if (r > 0)              result.push(idx - this.width);
    if (r < this.height - 1) result.push(idx + this.width);
    return result;
  }

  private floodFill(start: number, owner: number, cells: Int8Array): number[] {
    const visited = new Set<number>();
    const queue = [start];
    while (queue.length > 0) {
      const curr = queue.pop()!;
      if (visited.has(curr)) continue;
      if (cells[curr] !== owner) continue;
      visited.add(curr);
      for (const n of this.orthogonalNeighbors(curr)) {
        if (!visited.has(n) && cells[n] === owner) queue.push(n);
      }
    }
    return [...visited];
  }

  private rayTraversal(
    sel: { kind: "rookRayCells" | "bishopRayCells" | "rayCells"; from: IRExpr; blockedBy?: string; dx?: number; dy?: number; maxSteps?: number },
    fromIdx: number,
    ctx: EvalCtx,
  ): string[] {
    const dirs: [number, number][] =
      sel.kind === "rookRayCells"   ? [[0,1],[0,-1],[1,0],[-1,0]] :
      sel.kind === "bishopRayCells" ? [[1,1],[1,-1],[-1,1],[-1,-1]] :
      [[(sel as {dx:number}).dx, (sel as {dy:number}).dy]];

    const result: string[] = [];
    const maxSteps = (sel as {maxSteps?: number}).maxSteps ?? Infinity;

    for (const [dx, dy] of dirs) {
      let f = fromIdx % this.width;
      let r = Math.floor(fromIdx / this.width);
      let steps = 0;

      while (steps < maxSteps) {
        f += dx; r += dy;
        if (f < 0 || f >= this.width || r < 0 || r >= this.height) break;
        const ni = r * this.width + f;
        const owner = ctx.cells[ni];
        const blocked =
          sel.blockedBy === "any"      ? owner !== -1 :
          sel.blockedBy === "enemy"    ? (owner !== -1 && owner !== ctx.currentPlayerIdx) :
          sel.blockedBy === "friendly" ? owner === ctx.currentPlayerIdx :
          false;  // "none" or undefined → never blocked
        result.push(indexToCoord(ni, this.width));
        if (blocked) break;
        steps++;
      }
    }
    return result;
  }

  // ─── Owner helpers ────────────────────────────────────────────────────────

  private resolveOwner(expr: IRExpr, ctx: EvalCtx): number {
    const val = this.evalExpr(expr, ctx);
    // A literal player name (e.g. "black") → look up by index
    if (typeof val === "string") return this.game.players.indexOf(val);
    // A number → player index
    if (typeof val === "number") return val;
    return 0;
  }

  private ownerName(val: number): string {
    if (val === -1) return "empty";
    return this.game.players[val] ?? "unknown";
  }

  private ownerToInt(name: string): number {
    if (name === "empty") return -1;
    const idx = this.game.players.indexOf(name);
    return idx === -1 ? -1 : idx;
  }

  private hasPieceType(pieceType: string): boolean {
    return this.game.pieceTypes.some((p) => p.id === pieceType);
  }

  // ─── Context factories ────────────────────────────────────────────────────

  private stateCtx(state: GridState): EvalCtx {
    return this.baseCtx(
      new Int8Array(state.cells),
      state.currentPlayer,
      state.turnNumber,
      (state.scores ?? new Array<number>(this.game.players.length).fill(0)).slice(),
      { ...(state.vars ?? {}) },
    );
  }

  private baseCtx(
    cells: Int8Array,
    playerIdx: number,
    turnNumber: number,
    scores: number[],
    vars: Record<string, number | boolean | string | null>,
  ): EvalCtx {
    return { cells, currentPlayerIdx: playerIdx, turnNumber, bindings: {}, scores, vars };
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private effectHasAdvanceTurn(eff: IREffect): boolean {
    switch (eff.kind) {
      case "advanceTurn": return true;
      case "sequence": return eff.effects.some((e) => this.effectHasAdvanceTurn(e));
      case "if": return this.effectHasAdvanceTurn(eff.then) || (!!eff.else && this.effectHasAdvanceTurn(eff.else));
      case "forEach": return this.effectHasAdvanceTurn(eff.do);
      default: return false;
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
