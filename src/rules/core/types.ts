// ─── Core types ──────────────────────────────────────────────────────────────

export type PlayerId = 0 | 1;
export type CellOwner = -1 | 0 | 1; // -1=empty, 0=black, 1=white

export interface GridState {
  cells: Int8Array;
  currentPlayer: PlayerId;
  turnNumber: number;
  /** Per-player scores, indexed 0..players.length-1. Optional for legacy runtimes. */
  scores?: number[];
  /** Named game-variable values. Optional for legacy runtimes. */
  vars?: Record<string, number | boolean | string | null>;
}

// ─── High-level schema (input) ────────────────────────────────────────────────

export interface GameSchema {
  id: string;
  name: string;
  runtime: string;
  players: string[];
  board: BoardSchema;
  turns: TurnsSchema;
  pieces: Record<string, PieceSchema>;
  setup: SetupEntry[];
  definitions: Record<string, DistanceDefinition>;
  moves: MoveSchema[];
  end: EndConditionSchema[];
  result: ResultSchema;
}

export interface BoardSchema {
  type: string;
  width: number;
  height: number;
  coordinates: string;
}

export interface TurnsSchema {
  type: string;
  first: string;
}

export interface PieceSchema {
  ownership: string;
  location: string;
  stacking: string;
}

export interface SetupEntry {
  place: string;
  owner: string;
  at: string;
}

export interface DistanceDefinition {
  metric: "king" | "rook" | "bishop" | "knight";
  distance: number;
}

export interface MoveSchema {
  id: string;
  label: string;
  source?: SourceSelector;
  target?: TargetSelector;
  allowedWhen?: AllowedWhen;
  effects: EffectSchema[];
}

export interface SourceSelector {
  type: string;
  piece: string;
  owner: string;
}

export interface TargetSelector {
  type: string;
  from: string;
  distance: string;
}

export interface AllowedWhen {
  type: string;
  moves?: string[];
  player?: string;
}

export type EffectSchema =
  | { type: "placePiece"; piece: string; owner: string; at: string }
  | { type: "setCellOwner"; cell: string; owner: string }
  | { type: "convertEnemyPiecesAtDistance"; from: string; distance: string; toOwner: string }
  | { type: "advanceTurn" };

export interface EndConditionSchema {
  type: string;
  piece?: string;
  count?: number;
  moves?: string[];
}

export interface ResultSchema {
  type: string;
  piece?: string;
  tie?: string;
}

// ─── Compiled plan (intermediate) ────────────────────────────────────────────

export interface CompiledPlan {
  runtime: string;
  grid: { width: number; height: number };
  players: string[];
  relations: Record<string, DistanceDefinition>;
  actions: CompiledAction[];
  setup: SetupEntry[];
  end: EndConditionSchema[];
  result: ResultSchema;
}

export interface CompiledAction {
  id: string;
  label: string;
  bindings: BindingSpec[];
  effects: EffectSpec[];
  allowedWhen?: AllowedWhenSpec;
}

export type BindingSpec =
  | ["ownedCells", string] // player variable
  | ["emptyCellsInRelation", string, string]; // relation name, source variable

export type EffectSpec =
  | ["setCellOwner", string, string] // cell var, owner var
  | ["clearCell", string] // cell var
  | ["convertCellsInRelation", string, string, string, string] // relation, center, fromOwner, toOwner
  | ["advanceTurn"];

export type AllowedWhenSpec =
  | { type: "noLegalMoves"; actions: string[]; player: string };

// ─── Runtime ─────────────────────────────────────────────────────────────────

export interface ActionInstance {
  id: string;
  actor: string;
  bindings: Record<string, string>; // coord strings
}

export interface BindingCandidates {
  [bindingName: string]: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApplyResult {
  state: GridState;
  trace: ActionTrace;
  event: GameEvent;
}

export interface ActionTrace {
  action: string;
  actor: string;
  bindings: Record<string, string>;
  bindingTrace: BindingTraceEntry[];
  effectTrace: EffectTraceEntry[];
  endConditionTrace: EndConditionTraceEntry[];
  /** Scores after all effects resolved. Present only for IRGameRuntime. */
  finalScores?: number[];
  /** Vars after all effects resolved. Present only for IRGameRuntime. */
  finalVars?: Record<string, number | boolean | string | null>;
}

export interface BindingTraceEntry {
  binding: string;
  explanation: string;
  candidates: string[];
  selected: string;
}

export interface ScoreChange {
  player: string;
  before: number;
  after: number;
}

export interface VarChange {
  name: string;
  before: number | boolean | string | null;
  after: number | boolean | string | null;
}

export interface EffectTraceEntry {
  effect: string;
  explanation: string;
  cellChanges: CellChange[];
  scoreChanges?: ScoreChange[];
  varChanges?: VarChange[];
}

export interface CellChange {
  cell: string;
  before: string;
  after: string;
}

export interface EndConditionTraceEntry {
  id: string;
  result: boolean;
}

export interface Outcome {
  winner: string | null; // player name or null for draw
  reason: string;
}

export interface GameEvent {
  type: "actionAccepted";
  turn: number;
  actor: string;
  action: ActionInstance;
  previousStateHash: string;
  nextStateHash: string;
  /** Score snapshot after this action (indexed by player). Present only for IRGameRuntime. */
  scores?: number[];
}

export interface ReplayResult {
  states: GridState[];
  events: GameEvent[];
  outcome: Outcome | null;
}

export interface CompileError {
  path: string;
  message: string;
}

export interface CompileResult {
  success: boolean;
  errors: CompileError[];
  plan: CompiledPlan | null;
  rulebook: string | null;
}

// ─── Runtime interface ────────────────────────────────────────────────────────

export interface GameRuntime {
  initialState(): GridState;
  legalActions(state: GridState): ActionInstance[];
  legalActionsForBinding(
    state: GridState,
    actionId: string,
    partialBindings: Record<string, string>
  ): string[];
  validate(state: GridState, action: ActionInstance): ValidationResult;
  apply(state: GridState, action: ActionInstance): ApplyResult;
  outcome(state: GridState): Outcome | null;
  explain(state: GridState, action: ActionInstance): ActionTrace;
  hash(state: GridState): string;
  replay(events: GameEvent[]): ReplayResult;
}
