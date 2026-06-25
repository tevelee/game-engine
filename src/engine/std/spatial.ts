/**
 * std.spatial.distance.v1 — distance metrics and spatial selectors over square grids.
 *
 * Provides distance predicates, ring/ray selectors, connected-group queries,
 * and the captureRay primitive used for flip detection in Reversi-style games.
 */

import type { SourceRef, IRExpr, IRSelector, IRPredicate } from "../ir/types";

export const SPATIAL_MODULE = "std.spatial.distance.v1";

// ─── Distance predicate ───────────────────────────────────────────────────────

/**
 * True when the distance between `from` and `to` satisfies `mode` and `value`.
 *
 * king distance     = max(|Δx|, |Δy|)   (includes diagonals)
 * manhattan distance = |Δx| + |Δy|      (orthogonal only)
 */
export function distanceMatches(
  from: IRExpr, to: IRExpr,
  metric: "king" | "manhattan",
  mode: "exactly" | "atMost" | "atLeast",
  value: number,
  src?: SourceRef,
): IRPredicate {
  return { kind: "distanceMatches", from, to, metric, mode, value, irType: "bool", src };
}

// ─── Spatial selectors ────────────────────────────────────────────────────────

/** Cells at a specific distance from `from`, measured by the given metric. */
export function cellsAtDistance(
  board: string,
  from: IRExpr,
  metric: "king" | "manhattan",
  mode: "exactly" | "atMost" | "atLeast",
  value: number,
  src?: SourceRef,
): IRSelector {
  return { kind: "cellsAtDistance", board, from, metric, mode, value,
           irType: { kind: "selector", of: "cell" }, src };
}

/** Cells reachable along orthogonal sliding rays (N/S/E/W). */
export function rookRayCells(
  board: string, from: IRExpr,
  blockedBy?: "any" | "enemy" | "friendly" | "none",
  src?: SourceRef,
): IRSelector {
  return { kind: "rookRayCells", board, from, blockedBy,
           irType: { kind: "selector", of: "cell" }, src };
}

/** Cells reachable along diagonal sliding rays (NE/NW/SE/SW). */
export function bishopRayCells(
  board: string, from: IRExpr,
  blockedBy?: "any" | "enemy" | "friendly" | "none",
  src?: SourceRef,
): IRSelector {
  return { kind: "bishopRayCells", board, from, blockedBy,
           irType: { kind: "selector", of: "cell" }, src };
}

/** Cells reachable along a single custom ray direction (dx, dy). */
export function rayCells(
  board: string, from: IRExpr,
  dx: number, dy: number,
  opts?: { maxSteps?: number; blockedBy?: "any" | "enemy" | "friendly" | "none" },
  src?: SourceRef,
): IRSelector {
  return { kind: "rayCells", board, from, dx, dy, ...opts,
           irType: { kind: "selector", of: "cell" }, src };
}

/** All cells connected to `from` through same-color pieces (Go group / flood-fill). */
export function connectedGroup(
  board: string, from: IRExpr,
  opts?: { pieceType?: string; owner?: IRExpr },
  src?: SourceRef,
): IRSelector {
  return { kind: "connectedGroup", board, from, ...opts,
           irType: { kind: "selector", of: "cell" }, src };
}

/**
 * Cells in direction (dx, dy) from `from` that are occupied by `through`-player's
 * pieces, stopping before the first `anchor`-player piece — but ONLY returned if
 * an anchor piece actually terminates the ray.
 *
 * Used for Reversi flip detection: returns opponent cells sandwiched between the
 * placed piece and the nearest friendly piece.
 */
export function captureRay(
  board: string, from: IRExpr,
  dx: number, dy: number,
  through: IRExpr, anchor: IRExpr,
  src?: SourceRef,
): IRSelector {
  return { kind: "captureRay", board, from, dx, dy, through, anchor,
           irType: { kind: "selector", of: "cell" }, src };
}

// ─── Spatial predicates ───────────────────────────────────────────────────────

/** True iff the connected group at `cell` has at least one empty neighbor (liberty). */
export function groupHasLiberty(
  cell: IRExpr, board: string,
  opts?: { pieceType?: string },
  src?: SourceRef,
): IRPredicate {
  return { kind: "groupHasLiberty", cell, board, ...opts, irType: "bool", src };
}

/**
 * True iff there exists a path of same-color pieces connecting `fromZone` to `toZone`.
 * Used for Hex-style win conditions.
 */
export function connects(
  board: string, owner: IRExpr,
  fromZone: string, toZone: string,
  src?: SourceRef,
): IRPredicate {
  return { kind: "connects", board, owner, fromZone, toZone, irType: "bool", src };
}
