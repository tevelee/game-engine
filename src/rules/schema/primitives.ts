/**
 * Primitive reference types — the atoms that every other schema node uses.
 *
 * Design intent
 * ─────────────
 * Every schema node that "names" something (a player, a cell, a piece type)
 * uses one of these reference types instead of raw strings.  This makes
 * the source of the value explicit:
 *
 *   literal   →  you wrote the value directly ("a1", "pawn")
 *   variable  →  a binding resolved at move-time ("$source", "$target")
 *   runtime   →  a well-known game-state slot ("$current", "$opponent")
 *
 * All three kinds look like strings in JSON, so the schema stays plain JSON.
 * The compiler distinguishes them by their prefix.
 */

// ─── Player references ────────────────────────────────────────────────────────

/**
 * A PlayerRef identifies who owns a piece or who is performing an action.
 *
 *   "$current"   — the player whose turn it is right now
 *   "$opponent"  — the sole opponent in a 2-player game
 *   "$any"       — matches any player (used in conditions/selectors)
 *   "$none"      — explicitly ownerless (used in effects: remove ownership)
 *   string       — a named player from game.players, e.g. "black", "white"
 */
export type PlayerRef =
  | "$current"
  | "$opponent"
  | "$any"
  | "$none"
  | (string & {}); // named player

// ─── Cell references ──────────────────────────────────────────────────────────

/**
 * A CellRef points to a specific cell, either by:
 *   - coordinate literal: "a1", "e4", "home"
 *   - bound variable:     "$source", "$target", "$from" (set by a Binding)
 */
export type CellRef = string; // "$…" = variable, anything else = literal coord

/** True iff a CellRef is a bound variable, not a literal coordinate. */
export function isCellVar(ref: CellRef): boolean {
  return ref.startsWith("$");
}

// ─── Piece references ─────────────────────────────────────────────────────────

/**
 * A PieceRef names a piece type defined in game.pieceTypes.
 * e.g. "stone", "pawn", "king", "checker"
 */
export type PieceRef = string;

// ─── Relation references ──────────────────────────────────────────────────────

/**
 * A RelationRef names a relation defined in game.relations.
 * e.g. "cloneDistance", "kingMoves", "rookRays"
 */
export type RelationRef = string;

// ─── Zone references ──────────────────────────────────────────────────────────

/**
 * A ZoneRef names a zone defined in game.zones.
 * e.g. "promotionRank", "homeRank", "center"
 */
export type ZoneRef = string;

// ─── Move references ──────────────────────────────────────────────────────────

/**
 * A MoveRef names a move defined in game.moves.
 * Used in allowedOnly/forbiddenWhen conditions and end conditions.
 */
export type MoveRef = string;

// ─── Numeric expressions ──────────────────────────────────────────────────────

/**
 * A NumExpr computes an integer value at runtime.
 * Used wherever "how many" appears (distance, count, score).
 *
 * Keeping this as a union lets the compiler generate efficient lookup tables
 * for simple cases and fall back to runtime evaluation for complex ones.
 */
export type NumExpr =
  | number                                        // literal integer
  | { stat: "pieceCount"; piece: PieceRef; owner: PlayerRef }
  | { stat: "turnNumber" }
  | { stat: "score"; player: PlayerRef }
  | { stat: "varValue"; name: string }
  | { op: "add" | "sub" | "mul" | "min" | "max"; left: NumExpr; right: NumExpr };

// ─── Comparison operators ─────────────────────────────────────────────────────

export type CompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

/** Evaluate a comparison between two resolved integers. */
export function evalCompare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case "==":  return a === b;
    case "!=":  return a !== b;
    case "<":   return a < b;
    case "<=":  return a <= b;
    case ">":   return a > b;
    case ">=":  return a >= b;
  }
}
