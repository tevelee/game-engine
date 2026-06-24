/**
 * Typed Intermediate Representation (IR) for board games.
 *
 * The IR is the resolved, type-annotated form that sits between a game
 * definition (what a designer writes) and compiled opcodes (what the
 * runtime executes).
 *
 * Properties of every IR node:
 *   irType   — the TypeScript-level type of the value this node produces
 *   src      — where this node came from (module, definition, human explain)
 *
 * The IR is concrete: no string references to named definitions, no
 * implicit resolution. Every `ref:` in a game definition has been inlined.
 * The `src` field preserves traceability back to the original source.
 *
 * Scope of this IR
 * ────────────────
 * This IR is scoped to single-board, turn-based, placement/movement games.
 * It does not model cards, dice, hidden information, or multi-board games.
 * Those would require extensions or a more generic kernel.
 */

// ─── Type system ──────────────────────────────────────────────────────────────

/** The type of a value an IR node can evaluate to. */
export type IRType =
  | "void"
  | "bool"
  | "int"
  | "cell"          // a coordinate on the board (e.g. "a1")
  | "piece"         // a piece entity with owner + type + location
  | "player"        // a player identity
  | "effect"        // a state mutation (no return value)
  | { kind: "selector"; of: IRType }   // Selector<T> — a finite set of T
  | { kind: "list";     of: IRType };  // List<T>    — ordered sequence of T

// ─── Source reference ─────────────────────────────────────────────────────────

/**
 * Traces an IR node back to its origin in the game definition or std library.
 * Used by the printer and debugger.
 */
export interface SourceRef {
  /** Which module defined this concept. e.g. "games.ataxx.v1", "std.spatial.v1" */
  module: string;
  /** The named definition this node was expanded from. e.g. "cloneTargets" */
  definition?: string;
  /** Human-readable explanation from the definition's `explain` field. */
  explain?: string;
}

// ─── Expression ───────────────────────────────────────────────────────────────

/**
 * An IRExpr evaluates to a scalar value (cell, player, int, bool, …).
 * Used as arguments to selectors, predicates, and effects.
 */
export type IRExpr = {
  irType: IRType;
  src?: SourceRef;
} & (
  /** A literal constant: null, true, false, 42, "a1" */
  | { kind: "lit";    value: null | boolean | number | string }

  /** A binding variable bound in the current action: "$source", "$target", "$cell" */
  | { kind: "var";    name: string }

  /** A named game-global variable: "currentPlayer", "turnNumber", "consecutivePasses" */
  | { kind: "global"; name: string }

  /** Access a field of a piece entity: piece.owner, piece.pieceType */
  | { kind: "field";  of: IRExpr; field: string }
);

// Conveniences used throughout
export const currentPlayerExpr: IRExpr = { kind: "global", name: "currentPlayer", irType: "player" };
export const opponentExpr: IRExpr      = { kind: "global", name: "opponent",       irType: "player" };
export const turnNumberExpr: IRExpr    = { kind: "global", name: "turnNumber",      irType: "int"    };

// ─── Selector ─────────────────────────────────────────────────────────────────

/**
 * An IRSelector evaluates to a finite set of values of a given type.
 * It is the set-returning half of the query language.
 *
 * The `irType` field is always `{ kind: "selector"; of: T }`.
 */
export type IRSelector = {
  irType: { kind: "selector"; of: IRType };
  src?: SourceRef;
} & (
  // ── Cell selectors ────────────────────────────────────────────────────────
  | { kind: "allCells";   board: string }
  | { kind: "emptyCells"; board: string }

  /** Cells at a specific distance from a source, measured by a metric. */
  | { kind: "cellsAtDistance";
      board:  string;
      from:   IRExpr;
      metric: "king" | "manhattan";
      mode:   "exactly" | "atMost" | "atLeast";
      value:  number }

  /** Cells reachable along orthogonal sliding rays (N/S/E/W). */
  | { kind: "rookRayCells";
      board: string;
      from:  IRExpr;
      blockedBy?: "any" | "enemy" | "friendly" | "none" }

  /** Cells reachable along diagonal sliding rays (NE/NW/SE/SW). */
  | { kind: "bishopRayCells";
      board: string;
      from:  IRExpr;
      blockedBy?: "any" | "enemy" | "friendly" | "none" }

  /** Cells reachable along a single custom ray direction. */
  | { kind: "rayCells";
      board: string;
      from:  IRExpr;
      dx:    number;
      dy:    number;
      maxSteps?: number;
      blockedBy?: "any" | "enemy" | "friendly" | "none" }

  /** All cells connected to `from` through same-color pieces (Go group). */
  | { kind: "connectedGroup";
      board:     string;
      from:      IRExpr;
      pieceType?: string;
      owner?:    IRExpr }

  /** An explicit hand-listed set of cell coordinates. */
  | { kind: "explicitCells"; coords: string[] }

  /** All cells in a named zone. */
  | { kind: "cellsInZone"; board: string; zone: string }

  // ── Piece selectors ───────────────────────────────────────────────────────
  | { kind: "allPieces";    board: string; pieceType?: string; owner?: IRExpr }
  | { kind: "piecesAtCell"; cell:  IRExpr; pieceType?: string; owner?: IRExpr }

  // ── All players ───────────────────────────────────────────────────────────
  | { kind: "allPlayers" }

  // ── Set operations ────────────────────────────────────────────────────────

  /**
   * Filter a selector by a predicate.
   * Inside `where`, the variable named by `binding` refers to the candidate.
   */
  | { kind: "filter";
      from:    IRSelector;
      binding: string;
      where:   IRPredicate }

  | { kind: "union";       of: IRSelector[] }
  | { kind: "intersection"; of: IRSelector[] }
  | { kind: "difference";  from: IRSelector; exclude: IRSelector }
);

// ─── Predicate ────────────────────────────────────────────────────────────────

/**
 * An IRPredicate evaluates to a boolean.
 * It is the boolean-returning half of the query language.
 *
 * The `irType` field is always `"bool"`.
 */
export type IRPredicate = {
  irType: "bool";
  src?: SourceRef;
} & (
  // ── Quantifiers ───────────────────────────────────────────────────────────
  | { kind: "exists"; in: IRSelector }
  | { kind: "forAll"; in: IRSelector; binding: string; where: IRPredicate }
  | { kind: "countCompare"; of: IRSelector; op: "==" | "!=" | "<" | "<=" | ">" | ">="; value: IRExpr }

  // ── Equality / comparison ─────────────────────────────────────────────────
  | { kind: "equals";  left: IRExpr; right: IRExpr }
  | { kind: "compare"; left: IRExpr; op: "==" | "!=" | "<" | "<=" | ">" | ">="; right: IRExpr }

  // ── Cell inspection ───────────────────────────────────────────────────────
  | { kind: "isEmpty";    cell: IRExpr }
  | { kind: "isOccupied"; cell: IRExpr }
  | { kind: "hasPiece";   cell: IRExpr; pieceType?: string; owner?: IRExpr }

  // ── Board-wide ────────────────────────────────────────────────────────────
  | { kind: "boardFull";  board: string }
  | { kind: "boardEmpty"; board: string }

  // ── Spatial ───────────────────────────────────────────────────────────────
  | { kind: "distanceMatches";
      from:   IRExpr;
      to:     IRExpr;
      metric: "king" | "manhattan";
      mode:   "exactly" | "atMost" | "atLeast";
      value:  number }

  /** True iff the connected group at `cell` has at least one liberty. */
  | { kind: "groupHasLiberty"; cell: IRExpr; board: string; pieceType?: string }

  /**
   * True iff there exists a path of same-color pieces connecting fromZone to toZone.
   * Used for Hex win conditions.
   */
  | { kind: "connects"; board: string; owner: IRExpr; fromZone: string; toZone: string }

  // ── Move availability (native recursive primitive) ────────────────────────
  /** True iff the player has at least one legal instance of any listed action. */
  | { kind: "hasLegalAction"; player: IRExpr; actions: string[] }

  // ── Boolean logic ─────────────────────────────────────────────────────────
  | { kind: "not"; of: IRPredicate }
  | { kind: "and"; of: IRPredicate[] }
  | { kind: "or";  of: IRPredicate[] }
  | { kind: "true"  }
  | { kind: "false" }
);

// ─── Effect ───────────────────────────────────────────────────────────────────

/**
 * An IREffect describes an atomic or composite state mutation.
 * Effects are pure state transitions — they have no return value (`irType: "effect"`).
 */
export type IREffect = {
  irType: "effect";
  src?: SourceRef;
} & (
  // ── Control flow ──────────────────────────────────────────────────────────
  | { kind: "sequence"; effects: IREffect[] }
  | { kind: "if"; condition: IRPredicate; then: IREffect; else?: IREffect }

  /**
   * Apply `do` to every element of `in`.
   * Inside `do`, the variable named by `binding` refers to the current element.
   * The selector is evaluated before any mutations from this forEach.
   */
  | { kind: "forEach"; in: IRSelector; binding: string; do: IREffect }

  // ── Piece mutations ───────────────────────────────────────────────────────
  | { kind: "placePiece";   pieceType: string; owner: IRExpr; at:   IRExpr }
  | { kind: "removePiece";  at: IRExpr }
  | { kind: "movePiece";    from: IRExpr;      to:    IRExpr }
  | { kind: "setPieceOwner"; at: IRExpr;       owner: IRExpr }

  /** Bulk ownership change: equivalent to forEach(in, setPieceOwner(toOwner)). */
  | { kind: "convertPieces"; in: IRSelector; toOwner: IRExpr }

  // ── Score mutations ───────────────────────────────────────────────────────
  | { kind: "addScore"; player: IRExpr; amount: IRExpr }
  | { kind: "setScore"; player: IRExpr; amount: IRExpr }

  // ── Variable mutations ────────────────────────────────────────────────────
  | { kind: "setVar";       name: string; value: IRExpr | null }
  | { kind: "incrementVar"; name: string; by?: number }

  // ── Turn control ──────────────────────────────────────────────────────────
  | { kind: "advanceTurn" }
  | { kind: "setNextPlayer"; player: IRExpr }
);

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * A binding resolves a named variable to a single cell chosen from a selector.
 * Bindings are evaluated left-to-right; later ones can reference earlier names.
 */
export interface IRBinding {
  name: string;
  irType: IRType;
  from: IRSelector;
  explain?: string;
  src?: SourceRef;
}

/**
 * A complete action definition: who acts, what they choose, when it's legal,
 * and what changes.
 */
export interface IRAction {
  id: string;
  label: string;
  actor: IRExpr;

  /** Ordered list of variable resolutions; each can reference prior binding names. */
  bindings: IRBinding[];

  /**
   * If set, this action type is unavailable unless the condition holds.
   * Checked once per turn for the whole action type (not per binding).
   * Use for: pass guards, phase-limited actions.
   */
  allowedWhen?: IRPredicate;

  /**
   * If set, this specific set of bindings is illegal unless the condition holds.
   * Checked after all bindings are resolved.
   * Use for: move-into-check detection, path clearance.
   */
  condition?: IRPredicate;

  effects: IREffect[];
  explain?: string;
  src?: SourceRef;
}

// ─── End condition ────────────────────────────────────────────────────────────

export interface IREndCondition {
  id: string;
  when: IRPredicate;
  explain?: string;
  src?: SourceRef;
}

// ─── Result rule ──────────────────────────────────────────────────────────────

export type IRResultRule =
  | { kind: "maxPieceCount"; pieceType: string; board: string; tie: "draw" | "sharedWin"; src?: SourceRef }
  | { kind: "maxScore";  tie: "draw"; src?: SourceRef }
  | { kind: "minScore";  tie: "draw"; src?: SourceRef }
  | { kind: "lastMoverLoses"; src?: SourceRef }
  | { kind: "firstMatch";
      cases: Array<{ condition: IRPredicate; winner: IRExpr; explain?: string }>;
      else?: "draw";
      src?: SourceRef };

// ─── State variable ───────────────────────────────────────────────────────────

export interface IRVar {
  name: string;
  type: "int" | "bool" | "cell" | "player";
  initial: number | boolean | string | null;
  explain?: string;
}

// ─── Named definition ─────────────────────────────────────────────────────────

/**
 * A named, documented expression.
 *
 * Named definitions are the authoring primitive: a game designer writes
 * `ownStoneCells`, `cloneTargets`, `convertAdjacentEnemyStones` — readable
 * names with explain strings. The IR expands them but preserves the names
 * and explanations in `src` fields for traceability.
 */
export interface IRDefinition {
  name: string;
  value: IRSelector | IRPredicate | IREffect;
  explain?: string;
  module?: string;
}

// ─── Complete game IR ─────────────────────────────────────────────────────────

/**
 * The complete resolved, type-annotated representation of a game.
 *
 * This is the output of the "resolve" pass and the input to the "compile" pass.
 * It can be pretty-printed for the playground IR viewer.
 */
export interface IRGame {
  id: string;
  version: number;
  name: string;
  description?: string;

  /** Which modules this game imports (informational). */
  modules: string[];

  board: {
    id: string;
    width: number;
    height: number;
    coordinates: "algebraic" | "numeric";
  };

  players: string[];

  pieceTypes: Array<{
    id: string;
    capturedAs: "remove" | "convert" | "toReserve";
    stacking: "single" | "stack";
    value?: number;
  }>;

  vars: IRVar[];

  /** Effects applied once at game start to establish initial state. */
  setup: IREffect[];

  /**
   * All named definitions that were created during game definition.
   * Stored here for documentation, testing, and the IR viewer.
   */
  definitions: IRDefinition[];

  actions: IRAction[];

  endConditions: IREndCondition[];

  result: IRResultRule;
}
