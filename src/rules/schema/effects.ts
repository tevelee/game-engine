/**
 * Effects — the write side of game state.
 *
 * Design intent
 * ─────────────
 * Effects are pure state mutations.  They describe WHAT CHANGES but not why.
 * The "why" comes from the Move that contains them.
 *
 * Effects are:
 *   atomic      — each Effect does exactly one thing
 *   composable  — `sequence` and `forEach` combine atomics into compound effects
 *   branchable  — `if/then/else` allows conditional mutation
 *
 * This structure lets the compiler:
 *   1. Enumerate all possible effects before execution (for undo/redo)
 *   2. Generate minimal diffs (only cells that changed)
 *   3. Validate effect correctness statically (wrong piece type, etc.)
 *
 * Effect categories
 * ─────────────────
 *   Piece       — create, destroy, move, transform pieces on the board
 *   Ownership   — change who a cell/piece belongs to
 *   Score       — add/set player scores
 *   Turn        — advance turn, change player order
 *   Variable    — set/increment named game variables (for custom state)
 *   Control     — if/then/else, forEach, sequence
 *
 * The `sequence` effect executes effects in order, with each step seeing
 * the result of the previous steps.  The `forEach` effect applies an effect
 * to every cell in a selector.
 *
 * Examples
 * ─────────
 *   Place a stone:           { type: "place", piece: "stone", owner: "$current", at: "$target" }
 *   Remove a piece:          { type: "remove", at: "$source" }
 *   Move a piece:            { type: "move", from: "$source", to: "$target" }
 *   Promote a pawn:          { type: "promote", at: "$target", to: "queen" }
 *   Convert adj. enemies:    { type: "forEach", in: enemyAdjacentSelector, do: setOwnerEffect }
 *   Flip sandwiched discs:   { type: "forEach", in: sandwichedSelector, do: convertEffect }
 *   Conditional remove:      { type: "if", condition: surrounded, then: removeEffect }
 *   Add score:               { type: "addScore", player: "$current", amount: 10 }
 *   Advance turn:            { type: "advanceTurn" }
 */

import type { PlayerRef, PieceRef, CellRef, NumExpr } from "./primitives";
import type { CellSelector } from "./logic";
import type { Condition } from "./logic";

export type Effect =
  // ── Piece creation / destruction ─────────────────────────────────────────
  /**
   * Place a new piece on an empty cell (or on a stack, if the piece type allows it).
   * Fails if the cell is occupied and stacking="single".
   */
  | { type: "place"; piece: PieceRef; owner: PlayerRef; at: CellRef }

  /**
   * Remove whatever piece is on the cell.
   * In capture semantics, use `capture` instead to record the captured piece.
   */
  | { type: "remove"; at: CellRef }

  // ── Piece movement ────────────────────────────────────────────────────────
  /**
   * Move the piece at `from` to `to`.
   * Equivalent to: remove(from) + place(same piece, same owner, at to).
   * The cell at `to` must be empty (for single-stack pieces).
   */
  | { type: "move"; from: CellRef; to: CellRef }

  /**
   * Swap the pieces on two cells (useful for Shogi-style games or puzzles).
   */
  | { type: "swap"; a: CellRef; b: CellRef }

  // ── Ownership changes ─────────────────────────────────────────────────────
  /**
   * Change who owns the piece on a cell without changing the piece type.
   * Core primitive for Ataxx (clone conversion), Reversi (flip), and Go (rare).
   *
   * `owner: "$none"` empties the cell (equivalent to remove for single pieces).
   */
  | { type: "setOwner"; at: CellRef; owner: PlayerRef }

  /**
   * Convert all pieces in a selector to a new owner.
   * Shorthand for `forEach(selector, setOwner(owner))`.
   * Preferred when the selector is named/complex for readability.
   */
  | { type: "convert"; in: CellSelector; toOwner: PlayerRef }

  // ── Piece transformation ──────────────────────────────────────────────────
  /**
   * Replace the piece type at a cell while preserving ownership.
   * Used for: pawn promotion, checker → king promotion.
   * The piece type at `at` must be valid for promotion.
   */
  | { type: "promote"; at: CellRef; to: PieceRef }

  /**
   * Capture the piece at a cell: record it as captured and remove it.
   * Different from `remove` in that it triggers capturedAs behaviour.
   * If the piece type has `capturedAs: "toReserve"`, it goes to the
   * capturing player's reserve for later drops.
   */
  | { type: "capture"; at: CellRef; by: PlayerRef }

  // ── Score mutations ───────────────────────────────────────────────────────
  /**
   * Add `amount` to a player's score.
   * `amount` can be a NumExpr (e.g. count captured pieces).
   */
  | { type: "addScore"; player: PlayerRef; amount: NumExpr }

  /**
   * Set a player's score to an absolute value.
   */
  | { type: "setScore"; player: PlayerRef; amount: NumExpr }

  // ── Turn control ──────────────────────────────────────────────────────────
  /**
   * End the current player's turn and move to the next player.
   * Follows the turn structure defined in game.turns.
   */
  | { type: "advanceTurn" }

  /**
   * Immediately designate who goes next, overriding the normal turn order.
   * Useful for bonus turns, losing a turn, etc.
   */
  | { type: "setNextPlayer"; player: PlayerRef }

  // ── Game variable mutations ───────────────────────────────────────────────
  /**
   * Set a named game variable to a value.
   * Variables are declared in game.vars.
   * Used for: en passant target cell, castling rights, ko cell (Go).
   */
  | { type: "setVar"; name: string; value: NumExpr | null }

  /**
   * Increment a named game variable by an amount (default 1).
   */
  | { type: "incrementVar"; name: string; by?: number }

  // ── Control flow ─────────────────────────────────────────────────────────
  /**
   * Apply an effect to every cell in a selector.
   * The selector is evaluated BEFORE any mutations from this forEach.
   *
   * Examples
   *   Convert all adjacent enemies:
   *     { type: "forEach", in: adjacentEnemies, do: setOwnerCurrent }
   *
   *   Remove all pieces in a group (Go capture):
   *     { type: "forEach", in: capturedGroup, do: { type: "remove", at: "$cell" } }
   *
   * Inside `do`, the bound variable `"$cell"` refers to the current iteration cell.
   */
  | { type: "forEach"; in: CellSelector; do: Effect }

  /**
   * Conditional effect. `else` is optional.
   */
  | { type: "if"; condition: Condition; then: Effect; else?: Effect }

  /**
   * Execute a list of effects in order.
   * Each effect sees the state as modified by all prior effects.
   */
  | { type: "sequence"; effects: Effect[] };
