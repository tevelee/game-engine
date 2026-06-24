/**
 * Bindings and Moves — the action layer.
 *
 * Design intent
 * ─────────────
 * A Move defines WHAT a player can do.  It is the central schema node that
 * connects all the other building blocks together:
 *
 *   who acts       →  actor (PlayerRef, default "$current")
 *   what piece     →  forPiece (optional PieceRef filter)
 *   which cells    →  bindings (ordered list of CellSelector resolutions)
 *   when legal     →  condition (Condition that must hold)
 *   when allowed   →  allowedOnly (guard for unconditional moves like pass)
 *   what changes   →  effects (Effect list)
 *
 * Bindings
 * ────────
 * A Binding resolves a named variable to a specific cell.  Bindings are
 * evaluated in order: each binding can reference the cells already chosen
 * by prior bindings.
 *
 * This gives us the "dependent binding" pattern cleanly:
 *
 *   source  — "choose one of your stones"
 *   target  — "choose an empty cell within king-1 of $source"
 *
 * The `$` prefix on a CellRef in any selector means "the cell chosen for
 * the binding named after $".  So `$source` = the cell bound to "source".
 *
 * Multiple bindings beyond source/target
 * ───────────────────────────────────────
 * Complex games need more than two:
 *
 *   Shogi drop:   piece (from reserve), target
 *   Chess 960 castling:  king-from, king-to, rook-from, rook-to
 *   Mancala sow:  pit, direction
 *
 * Pass-like moves
 * ───────────────
 * Pass has no bindings.  It's legal only under a specific condition.
 * Use `allowedOnly` (not `condition`) to express "this move exists only
 * when the guard holds".  The difference:
 *
 *   condition     — checked for every candidate set of bindings;
 *                   "this specific binding choice is illegal"
 *   allowedOnly   — checked once for the whole move;
 *                   "this move type is even available at all"
 *
 * Move categories
 * ───────────────
 * The optional `category` string is cosmetic metadata for the UI and
 * generated rulebook.  The runtime doesn't use it for logic.
 *
 *   "placement"  — place a piece without moving one (Go, Ataxx clone)
 *   "move"       — relocate a piece (chess standard move)
 *   "capture"    — remove an opponent piece as part of the move
 *   "drop"       — place a piece from reserve (Shogi)
 *   "pass"       — skip the turn
 *   "special"    — anything else (castling, en passant, promotion choice)
 */

import type { PlayerRef, PieceRef, MoveRef } from "./primitives";
import type { CellSelector, Condition } from "./logic";
import type { Effect } from "./effects";

// ─── Binding ──────────────────────────────────────────────────────────────────

/**
 * One binding resolves to a single cell chosen from a CellSelector.
 *
 * After resolution, the chosen cell is available as `"$" + name` in all
 * subsequent bindings, conditions, and effects.
 *
 * `prompt`  — UI hint for the interactive selection step.
 *             e.g. "Choose a piece to move", "Choose a destination"
 *
 * `where`   — an additional Condition that must hold for the candidate cell.
 *             Applied after the `from` selector reduces the candidate list.
 *             Use for constraints that are hard to express as a pure selector:
 *               "target is not in check after the move"
 */
export interface Binding {
  name: string;
  from: CellSelector;
  where?: Condition;
  prompt?: string;
}

// ─── Move ─────────────────────────────────────────────────────────────────────

export interface Move {
  id: string;
  label: string;

  /**
   * Which player makes this move.  Default: "$current".
   * Rarely overridden; useful in games where a player places opponent pieces
   * or a "neutral" move happens automatically.
   */
  actor?: PlayerRef;

  /**
   * If set, this move can only be made by pieces of this type.
   * The runtime links the first binding's candidates to pieces of this type.
   * e.g. forPiece: "pawn" means the first binding must select a pawn.
   *
   * When absent, the move is not tied to a specific piece type (e.g. pass,
   * or placement moves where the piece type is fixed in the effects).
   */
  forPiece?: PieceRef;

  /**
   * Bindings that parameterise this move, resolved in order.
   * Most moves have 1–2 bindings (source, target).
   * Leave empty for parameter-free moves (pass, resign, accept-draw).
   */
  bindings?: Binding[];

  /**
   * Condition that must hold for a specific set of bindings to be legal.
   * Evaluated AFTER bindings are resolved.
   *
   * Use for constraints that depend on ALL bindings:
   *   "the king would not be in check after moving"
   *   "the path from source to target must be clear"
   *   "the target cell is not adjacent to the opponent's king"
   */
  condition?: Condition;

  /**
   * Guard condition for the move as a whole.
   * If this condition is false, the move type is not available AT ALL
   * (no instances will be generated), regardless of bindings.
   *
   * Use for: pass (only when no other moves), resign (always available),
   * phase-limited moves, special actions.
   *
   * Different from `condition`: `allowedOnly` is checked once per turn,
   * `condition` is checked per binding combination.
   */
  allowedOnly?: Condition;

  /**
   * Effects applied when the move is executed.
   * Effects are applied in order, each seeing the result of the previous.
   */
  effects: Effect[];

  /**
   * Which game phase(s) this move is available in.
   * If absent, the move is available in all phases.
   * Phases are defined in game.phases.
   */
  phases?: string[];

  /** Optional grouping/styling hint for the UI and rulebook generator. */
  category?: "placement" | "move" | "capture" | "drop" | "pass" | "special";

  /** Short notation template.  "$source-$target" for chess-style. */
  notation?: string;

  /** Longer description for the generated rulebook. */
  description?: string;
}

// ─── Move reference utilities ─────────────────────────────────────────────────

/**
 * A resolved move instance: the move was executed with these specific binding
 * values.  Produced by the runtime, not authored in the schema.
 */
export interface MoveInstance {
  moveId: MoveRef;
  actor: string;             // resolved player name
  bindings: Record<string, string>; // name → coord string
}
