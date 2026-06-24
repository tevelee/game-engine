/**
 * Piece types — what physical game objects can exist on the board.
 *
 * Design intent
 * ─────────────
 * A PieceType is a "class" of game object.  An individual piece on the board
 * is an INSTANCE of a PieceType, owning a particular cell and optionally
 * belonging to a player.
 *
 * Piece types do NOT embed their own movement rules.  Movement is expressed
 * in Move definitions that reference piece types.  This separation allows:
 *   - a single piece type used in different moves (e.g. "stone" used in both
 *     clone and jump)
 *   - the same move applied to multiple piece types
 *   - clean extension: adding a piece type doesn't require touching moves
 *
 * Attributes capture the semantic meaning of the piece rather than its
 * rules.  A compiler uses these to generate efficient state representations.
 *
 * Examples
 * ─────────
 *   stone (Ataxx/Go):     single-stacking, player-owned, no facing
 *   pawn (Chess):         single-stacking, player-owned, faces "forward"
 *   rook (Chess):         single-stacking, player-owned, no facing
 *   checker (Checkers):   single-stacking, player-owned, faces "forward"
 *   king (Checkers):      promotes from checker, faces "any"
 *   disc (Reversi):       single-stacking, player-owned, "flippable"
 */

import type { PieceRef, ZoneRef } from "./primitives";

export interface PieceType {
  id: string;
  label: string;

  /**
   * Who can own this piece type?
   *
   *   "player"    — each instance belongs to one of the game's players
   *   "neutral"   — exists on the board with no player affiliation
   *   "shared"    — exists on the board, associated with the game (not a player)
   */
  ownership: "player" | "neutral" | "shared";

  /**
   * Can multiple pieces of this type share a cell?
   *
   *   "single"          — exactly one piece per cell (chess, Ataxx, Go)
   *   "stack"           — multiple pieces stack (backgammon checkers)
   *   { max: number }   — at most N pieces per cell
   */
  stacking?: "single" | "stack" | { max: number };

  /**
   * Does this piece have a facing direction?
   *
   *   "none"     — symmetric; orientation doesn't matter (stone, disc, rook)
   *   "forward"  — oriented toward the player's "forward" direction (pawn)
   *   "fixed"    — orientation is set explicitly (not common in abstract games)
   *
   * When "forward", move schemas with player-relative relations (forward,
   * forwardDiagonal) automatically adapt to each player's orientation.
   */
  facing?: "none" | "forward" | "fixed";

  /**
   * Promotion — this piece type can transform into another under certain
   * conditions.  The promotion trigger is defined in the move or as an
   * automatic effect when a piece enters a promotion zone.
   *
   * E.g. pawn → queen, checker → king
   */
  promotion?: {
    intoAny?: PieceRef[];         // list of piece types the player may choose
    into?: PieceRef;              // auto-promotes to a single type (no choice)
    when: "entersZone";           // currently only zone-based promotion is supported
    zone: ZoneRef;                // zone where promotion triggers
  };

  /**
   * What happens when this piece is "captured" (removed by an opponent move)?
   *
   *   "remove"     — piece leaves the board entirely (chess default)
   *   "convert"    — piece changes ownership (Ataxx, Reversi)
   *   "toReserve"  — piece enters the capturing player's reserve (Shogi drops)
   */
  capturedAs?: "remove" | "convert" | "toReserve";

  /**
   * Point value of this piece, for scoring purposes.
   * Used with the "score" result rule.
   */
  value?: number;

  /** Cosmetic metadata. */
  symbol?: string;   // Unicode symbol for display: "♟", "●", "○"
  color?: string;    // CSS color override
}
