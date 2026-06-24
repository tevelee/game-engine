/**
 * Relation — the mapping from a cell to a set of cells.
 *
 * Design intent
 * ─────────────
 * A Relation answers the question: "Given cell X, which cells are Y-reachable?"
 * This is the fundamental primitive for all movement, capture, and influence.
 *
 * Relations compose.  The same combinators that work for sets work for relations:
 *   union           — "clone OR jump" distance
 *   intersection    — "diagonally adjacent AND on file d"
 *   compose         — "one rook-step, then one bishop-step" (knight!)
 *   excluding       — "rook ray, but not the capturing cell itself"
 *
 * Relation types fall into five families:
 *
 *   Metric          exact Chebyshev / Manhattan / diagonal distance
 *   Sliding ray     extends until a blocker or the board edge
 *   Leap            discrete jump (knight, camel, giraffe)
 *   Player-relative "forward" / "forward-diagonal" — flip per player
 *   Combinator      union, intersection, compose, excluding, conditional
 *
 * Named Relations live in game.relations and are referenced by string wherever
 * a RelationInput is expected.  Inline Relation objects can be embedded
 * directly — useful for one-off compound expressions.
 *
 * Examples
 * ─────────
 *   King 1-step:       { type: "chebyshev", distance: 1 }
 *   Clone range:       { type: "chebyshev", distance: 1 }        (alias: adjacent)
 *   Jump range:        { type: "chebyshev", distance: 2 }
 *   Rook slide:        { type: "rookRay" }
 *   Bishop slide:      { type: "bishopRay" }
 *   Knight:            { type: "leap", dx: 2, dy: 1 }  (+ all 8 rotations)
 *   Pawn push:         { type: "forward", distance: 1 }
 *   Pawn capture:      { type: "forwardDiagonal", distance: 1 }
 *   Pawn double push:  { type: "forward", distance: 2, onlyFrom: "homeRank" }
 *   Queen:             { type: "union", of: ["rookRay", "bishopRay"] }
 *   King:              { type: "chebyshev", distance: 1 }
 */

import type { ZoneRef, PlayerRef } from "./primitives";

/** Either a named reference or an inline definition. */
export type RelationInput = RelationRef | Relation;
export type RelationRef = string;

export type Relation =
  // ── Metric (exact distance) ───────────────────────────────────────────────
  /**
   * Cells at exact Chebyshev distance d.
   * distance=1 → immediate king-step neighborhood (8 cells on a full board)
   * distance=2 → ring of cells 2 king-steps away (16 on a full board)
   */
  | { type: "chebyshev"; distance: number }

  /**
   * Cells at exact Manhattan (orthogonal) distance d.
   * distance=1 → 4 orthogonal neighbors
   * distance=2 → cells a rook-2 steps away (not the diagonals)
   */
  | { type: "manhattan"; distance: number }

  /**
   * Cells at exact diagonal distance d.
   * distance=1 → 4 diagonal neighbors
   */
  | { type: "diagonal"; distance: number }

  // ── Sliding rays (until edge or optional blocker) ─────────────────────────
  /**
   * All cells along orthogonal rays (N, S, E, W) until the board edge.
   * Used for: rook, queen (orthogonal component), cross patterns.
   * `blockedBy` — stop before/at cells matching this owner (default: stop at any piece)
   */
  | { type: "rookRay"; blockedBy?: "any" | "enemy" | "friendly" | "none" }

  /**
   * All cells along diagonal rays (NE, NW, SE, SW) until the board edge.
   * Used for: bishop, queen (diagonal component), X patterns.
   */
  | { type: "bishopRay"; blockedBy?: "any" | "enemy" | "friendly" | "none" }

  /**
   * A single ray in a specific grid direction.
   * dx/dy are per-step deltas: (1,0)=east, (0,1)=north, (1,1)=NE, etc.
   * Used for: directional slide, pawn ray, custom beam.
   */
  | { type: "ray"; dx: number; dy: number; maxSteps?: number;
      blockedBy?: "any" | "enemy" | "friendly" | "none" }

  // ── Discrete leaps ───────────────────────────────────────────────────────
  /**
   * Jumps to all cells reachable by the (dx, dy) offset and its rotations.
   * `rotations` — how many symmetric variants to include:
   *   "all4"   — 4-fold symmetry: (dx,dy),(dy,-dx),(-dx,-dy),(-dy,dx)
   *   "all8"   — 8-fold symmetry (adds reflections): standard knight
   *   "none"   — only the exact (dx, dy) vector (directional leap)
   * Knight: { type: "leap", dx: 2, dy: 1, rotations: "all8" }
   * Camel:  { type: "leap", dx: 3, dy: 1, rotations: "all8" }
   */
  | { type: "leap"; dx: number; dy: number; rotations?: "all4" | "all8" | "none" }

  // ── Player-relative (automatically flips for the other player) ────────────
  /**
   * Cells N steps directly "forward" for the current player.
   * "Forward" means increasing rank for player[0], decreasing for player[1].
   * `onlyFrom` — further restricts to cells in this zone (for pawn double push).
   */
  | { type: "forward"; steps?: number; onlyFrom?: ZoneRef }

  /**
   * Cells N steps forward-diagonally for the current player.
   * Used for: pawn captures (chess), checker forward-diagonal moves.
   */
  | { type: "forwardDiagonal"; steps?: number }

  /**
   * Cells N steps in any direction except backward.
   * Used for: checkers kings (can move in all 4 diagonal directions).
   */
  | { type: "forwardAny"; steps?: number }

  // ── Graph-relative ────────────────────────────────────────────────────────
  /**
   * Cells reachable in exactly N hops along the graph's adjacency edges.
   * On a squareGrid with N=1, equivalent to chebyshev(1).
   * More interesting on GraphSpace topologies (Nine Men's Morris, Halma).
   */
  | { type: "graphDistance"; hops: number }

  /**
   * All cells reachable from a cell by following group membership.
   * Used for Go-style flood-fill (find all stones in a group).
   */
  | { type: "floodFill"; piece?: string; owner?: PlayerRef }

  // ── Combinators ──────────────────────────────────────────────────────────
  /**
   * All cells reachable by ANY of the given relations.
   * Queen = union of rookRay + bishopRay.
   * Ataxx combined = union of clone + jump distance.
   */
  | { type: "union"; of: RelationInput[] }

  /**
   * Cells reachable by ALL of the given relations.
   * Rarely useful as a standalone move, but handy in conditions:
   * "cells that are both in the opponent's territory and diagonal from source".
   */
  | { type: "intersection"; of: RelationInput[] }

  /**
   * Apply `first`, then from each result apply `then`.
   * Useful for multi-step paths, e.g. "one step forward then one step diagonal".
   * Note: this is relation COMPOSITION, not sequence of effects.
   */
  | { type: "compose"; first: RelationInput; then: RelationInput }

  /**
   * All cells reachable by `base` but NOT reachable by `exclude`.
   * Used for: "empty cells in range" (base=range, exclude=occupied).
   * (In practice, use CellSelector filters instead — this is for precomputed tables.)
   */
  | { type: "excluding"; base: RelationInput; exclude: RelationInput }

  /**
   * Allows specifying different relations per player.
   * Key use case: checkers kings move the same regardless of player,
   * but regular checkers move direction-relative.
   */
  | { type: "byPlayer"; cases: Array<{ player: PlayerRef; relation: RelationInput }> };
