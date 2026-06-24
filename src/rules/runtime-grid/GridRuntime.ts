import type {
  GridState,
  CompiledPlan,
  ActionInstance,
  ValidationResult,
  ApplyResult,
  ActionTrace,
  BindingTraceEntry,
  EffectTraceEntry,
  EndConditionTraceEntry,
  Outcome,
  GameEvent,
  ReplayResult,
  GameRuntime,
  CellChange,
} from "../core/types";
import { coordToIndex, indexToCoord } from "../core/coordinates";
import { hashState } from "../core/hashing";
import { buildRelations } from "./relations";
import type { RelationMap } from "./relations";

export class GridRuntime implements GameRuntime {
  private plan: CompiledPlan;
  private relations: RelationMap;
  private totalCells: number;

  constructor(plan: CompiledPlan) {
    this.plan = plan;
    this.totalCells = plan.grid.width * plan.grid.height;
    this.relations = buildRelations(plan.grid.width, plan.grid.height, plan.relations);
  }

  initialState(): GridState {
    const { width } = this.plan.grid;
    const cells = new Int8Array(this.totalCells).fill(-1);

    for (const entry of this.plan.setup) {
      const idx = coordToIndex(entry.at, width);
      const owner = this.playerIndex(entry.owner);
      cells[idx] = owner;
    }

    const firstPlayer = this.playerIndex(this.plan.players[0]);
    return {
      cells,
      currentPlayer: firstPlayer as 0 | 1,
      turnNumber: 1,
    };
  }

  legalActions(state: GridState): ActionInstance[] {
    const actions: ActionInstance[] = [];
    const actor = this.plan.players[state.currentPlayer];

    for (const action of this.plan.actions) {
      if (action.allowedWhen) {
        if (action.allowedWhen.type === "noLegalMoves") {
          const blockingActions = action.allowedWhen.actions
            .map((id) => this.plan.actions.find((a) => a.id === id))
            .filter(Boolean);
          const hasLegal = blockingActions.some((a) =>
            this.enumerateBindings(state, a!).length > 0
          );
          if (!hasLegal) {
            actions.push({ id: action.id, actor, bindings: {} });
          }
        }
        continue;
      }

      for (const bindings of this.enumerateBindings(state, action)) {
        actions.push({ id: action.id, actor, bindings });
      }
    }

    return actions;
  }

  legalActionsForBinding(
    state: GridState,
    actionId: string,
    partialBindings: Record<string, string>
  ): string[] {
    const action = this.plan.actions.find((a) => a.id === actionId);
    if (!action) return [];

    const { width } = this.plan.grid;

    // Determine which binding we're resolving next
    const bindingNames = this.getBindingNames(action);
    const nextBinding = bindingNames.find((n) => !(n in partialBindings));
    if (!nextBinding) return [];

    const bindingIndex = bindingNames.indexOf(nextBinding);
    const spec = action.bindings[bindingIndex];

    if (spec[0] === "ownedCells") {
      return this.ownedCells(state, state.currentPlayer).map((i) =>
        indexToCoord(i, width)
      );
    }

    if (spec[0] === "emptyCellsInRelation") {
      const [, relationName, sourceVar] = spec as [string, string, string];
      const sourceCoord = partialBindings[sourceVar.slice(1)];
      if (!sourceCoord) return [];
      const sourceIdx = coordToIndex(sourceCoord, width);
      const relation = this.relations.get(relationName) ?? [];
      const neighbors = relation[sourceIdx] ?? [];
      return neighbors
        .filter((i) => state.cells[i] === -1)
        .map((i) => indexToCoord(i, width));
    }

    return [];
  }

  validate(state: GridState, action: ActionInstance): ValidationResult {
    const legal = this.legalActions(state);
    const match = legal.some(
      (a) =>
        a.id === action.id &&
        JSON.stringify(a.bindings) === JSON.stringify(action.bindings)
    );
    return match
      ? { valid: true, errors: [] }
      : { valid: false, errors: [`Action ${action.id} with given bindings is not legal.`] };
  }

  apply(state: GridState, action: ActionInstance): ApplyResult {
    const prevHash = this.hash(state);
    const trace = this.explain(state, action);
    const newCells = new Int8Array(state.cells);

    for (const effectEntry of trace.effectTrace) {
      for (const change of effectEntry.cellChanges) {
        const idx = coordToIndex(change.cell, this.plan.grid.width);
        newCells[idx] = this.ownerToInt(change.after);
      }
    }

    let nextPlayer = state.currentPlayer;
    let nextTurn = state.turnNumber;

    const actionDef = this.plan.actions.find((a) => a.id === action.id);
    const hasAdvance = actionDef?.effects.some((e) => e[0] === "advanceTurn") ?? false;
    if (hasAdvance) {
      nextPlayer = (1 - state.currentPlayer) as 0 | 1;
      nextTurn = state.turnNumber + 1;
    }

    const newState: GridState = {
      cells: newCells,
      currentPlayer: nextPlayer,
      turnNumber: nextTurn,
    };

    const nextHash = this.hash(newState);

    const event: GameEvent = {
      type: "actionAccepted",
      turn: state.turnNumber,
      actor: action.actor,
      action,
      previousStateHash: prevHash,
      nextStateHash: nextHash,
    };

    return { state: newState, trace, event };
  }

  outcome(state: GridState): Outcome | null {
    for (const cond of this.plan.end) {
      if (cond.type === "boardFull") {
        const filled = Array.from(state.cells).every((c) => c !== -1);
        if (filled) return this.computeResult(state);
      }
      if (cond.type === "anyPlayerPieceCountEquals") {
        for (let p = 0; p < this.plan.players.length; p++) {
          const count = Array.from(state.cells).filter((c) => c === p).length;
          if (count === cond.count) return this.computeResult(state);
        }
      }
      if (cond.type === "allPlayersHaveNoLegalMoves" && cond.moves) {
        const moveDefs = cond.moves
          .map((id) => this.plan.actions.find((a) => a.id === id))
          .filter(Boolean);

        const allBlocked = this.plan.players.every((_, pi) => {
          const fakeState: GridState = {
            cells: state.cells,
            currentPlayer: pi as 0 | 1,
            turnNumber: state.turnNumber,
          };
          return moveDefs.every((a) => this.enumerateBindings(fakeState, a!).length === 0);
        });

        if (allBlocked) return this.computeResult(state);
      }
    }

    return null;
  }

  explain(state: GridState, action: ActionInstance): ActionTrace {
    const { width } = this.plan.grid;
    const actionDef = this.plan.actions.find((a) => a.id === action.id);
    if (!actionDef) throw new Error(`Unknown action: ${action.id}`);

    const bindingTrace: BindingTraceEntry[] = [];
    const bindingNames = this.getBindingNames(actionDef);

    for (let i = 0; i < actionDef.bindings.length; i++) {
      const spec = actionDef.bindings[i];
      const name = bindingNames[i];
      const selected = action.bindings[name] ?? "";

      let candidates: string[] = [];
      let explanation = "";

      if (spec[0] === "ownedCells") {
        candidates = this.ownedCells(state, state.currentPlayer).map((idx) =>
          indexToCoord(idx, width)
        );
        explanation = `Choose one of ${this.plan.players[state.currentPlayer]}'s own stones.`;
      } else if (spec[0] === "emptyCellsInRelation") {
        const [, relName, srcVar] = spec as [string, string, string];
        const srcCoord = action.bindings[srcVar.slice(1)] ?? selected;
        const srcIdx = coordToIndex(srcCoord, width);
        const rel = this.relations.get(relName) ?? [];
        candidates = (rel[srcIdx] ?? [])
          .filter((i) => state.cells[i] === -1)
          .map((i) => indexToCoord(i, width));
        explanation = `Choose an empty cell in relation "${relName}" from ${srcCoord}.`;
      }

      bindingTrace.push({ binding: name, explanation, candidates, selected });
    }

    const effectTrace: EffectTraceEntry[] = [];
    const workingCells = new Int8Array(state.cells);

    const resolveVar = (v: string): number => {
      if (v === "$currentPlayer") return state.currentPlayer;
      if (v === "$opponent") return 1 - state.currentPlayer;
      const coord = action.bindings[v.slice(1)];
      return coordToIndex(coord, width);
    };

    for (const effect of actionDef.effects) {
      const op = effect[0];

      if (op === "setCellOwner") {
        const cellIdx = resolveVar(effect[1] as string);
        const ownerIdx = resolveVar(effect[2] as string) as -1 | 0 | 1;
        const before = this.ownerName(workingCells[cellIdx] as CellOwner);
        const after = this.ownerName(ownerIdx);
        const coord = indexToCoord(cellIdx, width);
        workingCells[cellIdx] = ownerIdx;
        effectTrace.push({
          effect: op,
          explanation: `Set ${coord} to ${after}.`,
          cellChanges: [{ cell: coord, before, after }],
        });
      } else if (op === "clearCell") {
        const cellIdx = resolveVar(effect[1] as string);
        const coord = indexToCoord(cellIdx, width);
        const before = this.ownerName(workingCells[cellIdx] as CellOwner);
        workingCells[cellIdx] = -1;
        effectTrace.push({
          effect: op,
          explanation: `Cleared ${coord}.`,
          cellChanges: [{ cell: coord, before, after: "empty" }],
        });
      } else if (op === "convertCellsInRelation") {
        const [, relName, centerVar, fromVar, toVar] = effect as string[];
        const centerIdx = resolveVar(centerVar);
        const fromOwner = resolveVar(fromVar) as CellOwner;
        const toOwner = resolveVar(toVar) as CellOwner;
        const rel = this.relations.get(relName) ?? [];
        const neighbors = rel[centerIdx] ?? [];
        const changes: CellChange[] = [];

        for (const ni of neighbors) {
          if (workingCells[ni] === fromOwner) {
            const coord = indexToCoord(ni, width);
            const before = this.ownerName(fromOwner);
            workingCells[ni] = toOwner;
            changes.push({ cell: coord, before, after: this.ownerName(toOwner) });
          }
        }

        effectTrace.push({
          effect: op,
          explanation:
            changes.length > 0
              ? `Converted ${changes.length} piece${changes.length > 1 ? "s" : ""} from ${this.ownerName(fromOwner)} to ${this.ownerName(toOwner)}.`
              : `No pieces to convert.`,
          cellChanges: changes,
        });
      } else if (op === "advanceTurn") {
        const nextPlayer = this.plan.players[1 - state.currentPlayer];
        effectTrace.push({
          effect: op,
          explanation: `Turn advanced to ${capitalize(nextPlayer)}.`,
          cellChanges: [],
        });
      }
    }

    const endConditionTrace: EndConditionTraceEntry[] = this.plan.end.map((cond) => {
      let result = false;
      if (cond.type === "boardFull") {
        result = Array.from(workingCells).every((c) => c !== -1);
      } else if (cond.type === "anyPlayerPieceCountEquals") {
        result = this.plan.players.some((_, pi) => {
          const count = Array.from(workingCells).filter((c) => c === pi).length;
          return count === cond.count;
        });
      } else if (cond.type === "allPlayersHaveNoLegalMoves" && cond.moves) {
        const moveDefs = cond.moves
          .map((id) => this.plan.actions.find((a) => a.id === id))
          .filter(Boolean);
        result = this.plan.players.every((_, pi) => {
          const fakeState: GridState = {
            cells: workingCells,
            currentPlayer: pi as 0 | 1,
            turnNumber: state.turnNumber,
          };
          return moveDefs.every((a) => this.enumerateBindings(fakeState, a!).length === 0);
        });
      }
      return { id: cond.type, result };
    });

    return {
      action: action.id,
      actor: action.actor,
      bindings: action.bindings,
      bindingTrace,
      effectTrace,
      endConditionTrace,
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

    return {
      states,
      events,
      outcome: this.outcome(current),
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private enumerateBindings(
    state: GridState,
    action: (typeof this.plan.actions)[number]
  ): Record<string, string>[] {
    const { width } = this.plan.grid;
    let results: Record<string, string>[] = [{}];

    const names = this.getBindingNames(action);

    for (let i = 0; i < action.bindings.length; i++) {
      const spec = action.bindings[i];
      const name = names[i];
      const next: Record<string, string>[] = [];

      for (const partial of results) {
        let candidates: number[] = [];

        if (spec[0] === "ownedCells") {
          candidates = this.ownedCells(state, state.currentPlayer);
        } else if (spec[0] === "emptyCellsInRelation") {
          const [, relName, srcVar] = spec as [string, string, string];
          const srcCoord = partial[srcVar.slice(1)];
          if (!srcCoord) continue;
          const srcIdx = coordToIndex(srcCoord, width);
          const rel = this.relations.get(relName) ?? [];
          candidates = (rel[srcIdx] ?? []).filter((i) => state.cells[i] === -1);
        }

        for (const c of candidates) {
          next.push({ ...partial, [name]: indexToCoord(c, width) });
        }
      }

      results = next;
    }

    return results;
  }

  private getBindingNames(action: (typeof this.plan.actions)[number]): string[] {
    return action.bindings.map((spec) => {
      if (spec[0] === "ownedCells") return "source";
      if (spec[0] === "emptyCellsInRelation") return "target";
      return "unknown";
    });
  }

  private ownedCells(state: GridState, player: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === player) result.push(i);
    }
    return result;
  }

  private playerIndex(name: string): number {
    const idx = this.plan.players.indexOf(name);
    return idx === -1 ? 0 : idx;
  }

  private ownerToInt(name: string): CellOwner {
    if (name === "empty") return -1;
    const idx = this.plan.players.indexOf(name);
    return idx as CellOwner;
  }

  private ownerName(val: CellOwner | number): string {
    if (val === -1) return "empty";
    return this.plan.players[val] ?? "unknown";
  }

  private computeResult(state: GridState): Outcome {
    if (this.plan.result.type === "maxPieceCount") {
      const counts = this.plan.players.map(
        (_, pi) => Array.from(state.cells).filter((c) => c === pi).length
      );
      const max = Math.max(...counts);
      const winners = this.plan.players.filter((_, pi) => counts[pi] === max);
      if (winners.length > 1) {
        return { winner: null, reason: "Draw — equal piece counts." };
      }
      return {
        winner: winners[0],
        reason: `${capitalize(winners[0])} wins with ${max} pieces.`,
      };
    }
    return { winner: null, reason: "Game over." };
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type CellOwner = -1 | 0 | 1;
