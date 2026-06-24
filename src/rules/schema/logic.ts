/**
 * Selectors and Conditions — the query language for game state.
 *
 * Design intent
 * ─────────────
 * Selectors and conditions are the two faces of the same coin:
 *
 *   CellSelector — evaluates to a SET of cells matching criteria
 *   Condition    — evaluates to a BOOLEAN about game state
 *
 * They're defined in one file because they frequently reference each other:
 *   - "cells that satisfy a condition"  is a CellSelector (the `where` form)
 *   - "exists a cell in this selector"  is a Condition  (the `exists` form)
 *
 * Both are composable using standard boolean combinators: and, or, not.
 *
 * CellSelector vs Relation
 * ────────────────────────
 * A Relation answers: "from cell X, which cells are Y-reachable?"
 * A CellSelector answers: "across the whole board, which cells match?"
 *
 * They combine: CellSelector `inRelation` applies a Relation FROM a specific
 * cell, giving the spatial filtering needed for move legality checking.
 *
 * Design constraint: both must be fully serializable to JSON.  No functions.
 */

import type { PlayerRef, PieceRef, CellRef, ZoneRef, MoveRef, NumExpr, CompareOp } from "./primitives";
import type { RelationInput } from "./relation";

// ─── Cell Selector ────────────────────────────────────────────────────────────

/**
 * A CellSelector describes a set of cells on the board.
 * The runtime evaluates it against the current game state to produce a
 * concrete list of cell coordinates.
 */
export type CellSelector =
  // ── Universe ──────────────────────────────────────────────────────────────
  /** Every cell on the board. */
  | { type: "all" }

  /** Cells with no piece of any kind. */
  | { type: "empty" }

  /** Cells with at least one piece of any kind. */
  | { type: "occupied" }

  // ── Specific cells ────────────────────────────────────────────────────────
  /** A single named cell by coordinate. */
  | { type: "cell"; coord: string }

  /** A hand-listed set of cells. */
  | { type: "cells"; coords: string[] }

  /** The cell stored in a named binding variable, e.g. "$source". */
  | { type: "bound"; name: string }

  // ── Piece filters ─────────────────────────────────────────────────────────
  /** Cells occupied by a specific piece type, optionally owned by a specific player. */
  | { type: "withPiece"; piece: PieceRef; owner?: PlayerRef }

  /** Cells owned by a player (regardless of piece type). */
  | { type: "withOwner"; owner: PlayerRef }

  // ── Spatial filters ───────────────────────────────────────────────────────
  /**
   * Cells reachable from `from` via `relation`.
   * Core primitive for move targeting:
   *   "empty cells within king-1 of source" = emptyInRelation(king1, $source)
   */
  | { type: "inRelation"; relation: RelationInput; from: CellRef }

  /**
   * Cells in `relation` from `from` that are also empty.
   * Shorthand for `and([inRelation(rel, from), empty()])`.
   */
  | { type: "emptyInRelation"; relation: RelationInput; from: CellRef }

  /**
   * Cells in `relation` from `from` that are occupied by `owner`.
   */
  | { type: "ownedInRelation"; relation: RelationInput; from: CellRef; owner: PlayerRef; piece?: PieceRef }

  /** Cells belonging to a named zone. */
  | { type: "inZone"; zone: ZoneRef }

  /** All cells on the board's outer edge (only meaningful for squareGrid/hexGrid). */
  | { type: "atEdge" }

  /** Just the corner cells of a square grid. */
  | { type: "atCorner" }

  // ── Relational / derived ──────────────────────────────────────────────────
  /**
   * The "frontier" of a piece group: cells adjacent to all pieces owned by
   * `owner` that are themselves empty.  Used for Go-style liberty checking.
   */
  | { type: "frontier"; owner: PlayerRef; piece?: PieceRef }

  /**
   * Cells between `from` and `to` along a straight line (exclusive).
   * Used for: checking that a rook's path is clear, "jumping over" in Halma.
   */
  | { type: "between"; from: CellRef; to: CellRef }

  // ── Boolean combinators ───────────────────────────────────────────────────
  /** Cells that appear in ALL given selectors. */
  | { type: "and"; of: CellSelector[] }

  /** Cells that appear in ANY given selector. */
  | { type: "or"; of: CellSelector[] }

  /**
   * Cells NOT matching `of`, optionally restricted to a universe.
   * If `within` is absent, the universe is all cells.
   */
  | { type: "not"; of: CellSelector; within?: CellSelector }

  // ── Conditional / filtered ────────────────────────────────────────────────
  /**
   * Cells from `base` that additionally satisfy `where`.
   * Allows arbitrary condition-based filtering:
   *   "cells adjacent to $source where the cell's piece count > 1"
   */
  | { type: "where"; base: CellSelector; where: Condition };

// ─── Condition ────────────────────────────────────────────────────────────────

/**
 * A Condition evaluates to true or false given the current game state.
 * Used for: move legality, allowedWhen guards, end conditions, effect branches.
 */
export type Condition =
  // ── Constants ─────────────────────────────────────────────────────────────
  | { type: "true" }
  | { type: "false" }

  // ── Cell inspection ───────────────────────────────────────────────────────
  /** True iff the given cell has no piece. */
  | { type: "isEmpty"; cell: CellRef }

  /** True iff the given cell has at least one piece. */
  | { type: "isOccupied"; cell: CellRef }

  /** True iff the given cell is owned by `owner`. */
  | { type: "isOwnedBy"; cell: CellRef; owner: PlayerRef }

  /** True iff the given cell holds a piece of type `piece`, optionally owned by `owner`. */
  | { type: "hasPiece"; cell: CellRef; piece: PieceRef; owner?: PlayerRef }

  /** True iff the given cell is inside `zone`. */
  | { type: "inZone"; cell: CellRef; zone: ZoneRef }

  // ── Count conditions ──────────────────────────────────────────────────────
  /**
   * Compare the number of pieces of a given type owned by a player.
   *
   * Examples
   *   { type: "pieceCount", piece: "stone", owner: "$current", op: "==", value: 0 }
   *   → player has no stones left (eliminate condition)
   */
  | { type: "pieceCount"; piece: PieceRef; owner: PlayerRef; op: CompareOp; value: NumExpr }

  /** Compare the number of cells matching a selector. */
  | { type: "selectorCount"; selector: CellSelector; op: CompareOp; value: NumExpr }

  // ── Board-state conditions ─────────────────────────────────────────────────
  /** True iff every cell on the board has at least one piece. */
  | { type: "boardFull" }

  /** True iff no cell on the board has any piece. */
  | { type: "boardEmpty" }

  // ── Move availability ─────────────────────────────────────────────────────
  /**
   * True iff the given player has at least one legal instance of any listed move.
   * Useful for pass-guard: "pass is only allowed when playerHasNoMove(clone, jump)".
   */
  | { type: "playerHasMove"; player: PlayerRef; moves: MoveRef[] }

  /** Inverse of playerHasMove. */
  | { type: "playerHasNoMove"; player: PlayerRef; moves: MoveRef[] }

  // ── Turn conditions ────────────────────────────────────────────────────────
  /** Compare the current turn number. Useful for turn limits. */
  | { type: "turnNumber"; op: CompareOp; value: NumExpr }

  /** True on the very first turn of the game. */
  | { type: "isFirstTurn" }

  /** True iff it is the named player's turn. */
  | { type: "isPlayerTurn"; player: string }

  // ── Score conditions ───────────────────────────────────────────────────────
  | { type: "score"; player: PlayerRef; op: CompareOp; value: NumExpr }

  // ── Variable conditions ────────────────────────────────────────────────────
  /** True iff a named game variable equals a value. Used for game-specific state. */
  | { type: "varEquals"; name: string; value: NumExpr }

  // ── Spatial / structural conditions ───────────────────────────────────────
  /**
   * True iff a path exists connecting `fromZone` to `toZone` entirely through
   * cells owned by `owner`.  Used for Hex win condition and Go territory.
   */
  | { type: "connects"; owner: PlayerRef; fromZone: ZoneRef; toZone: ZoneRef; piece?: PieceRef }

  /**
   * True iff the piece group containing `cell` has at least one liberty
   * (adjacent empty cell).  Used for Go capture detection.
   */
  | { type: "groupHasLiberty"; cell: CellRef; piece?: PieceRef }

  /**
   * True iff the piece group containing `cell` is completely surrounded.
   * Equivalent to NOT groupHasLiberty; provided as a named convenience.
   */
  | { type: "groupSurrounded"; cell: CellRef; piece?: PieceRef }

  // ── Quantifiers ───────────────────────────────────────────────────────────
  /** True iff at least one cell in `in` satisfies `condition`. */
  | { type: "exists"; in: CellSelector; condition?: Condition }

  /** True iff every cell in `in` satisfies `condition`. */
  | { type: "forAll"; in: CellSelector; condition: Condition }

  /** True iff exactly `count` cells in `in` satisfy `condition`. */
  | { type: "exactly"; count: NumExpr; in: CellSelector; condition?: Condition }

  // ── Boolean combinators ───────────────────────────────────────────────────
  | { type: "not"; of: Condition }
  | { type: "and"; of: Condition[] }
  | { type: "or"; of: Condition[] };
