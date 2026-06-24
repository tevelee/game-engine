/**
 * Space — the topology of the game board.
 *
 * Design intent
 * ─────────────
 * A Space defines the set of cells and which cells are "adjacent" at the
 * most basic level.  Relations (→ relation.ts) build on top of this to
 * define richer neighborhood concepts.
 *
 * The four space types cover the overwhelming majority of abstract games:
 *
 *   squareGrid   chess, checkers, Ataxx, Reversi, Go, Battleship
 *   hexGrid      Hex, Hive, Blokus Trigon
 *   linear       backgammon board, Mancala row, a dice track
 *   graph        custom topology — Halma star, Nine Men's Morris, Pente
 *
 * Named zones (→ Zone) let game designers carve the space into semantically
 * meaningful regions: "black's home rank", "promotion zone", "center 4 cells".
 * Zones are referenced by name in Selectors, Conditions, and ResultRules.
 */

// ─── Space ────────────────────────────────────────────────────────────────────

export type Space =
  | SquareGrid
  | HexGrid
  | LinearTrack
  | GraphSpace;

/**
 * A rectangular grid of cells.
 * Files (columns) are labelled a–z, ranks (rows) are 1–N.
 * Algebraic notation: "a1" = bottom-left (file a, rank 1).
 *
 * Used by: Chess, Checkers, Go, Ataxx, Reversi, Breakthrough…
 */
export interface SquareGrid {
  type: "squareGrid";
  width: number;         // number of files (columns)
  height: number;        // number of ranks (rows)
  coordinates?: "algebraic" | "numeric" | "rowcol";
                         // default: "algebraic"
}

/**
 * A hexagonal grid.
 *
 * Used by: Hex, Y, Hive (abstract hexagonal placement)
 *
 * `layout` — how hexagons are oriented:
 *   "pointy"  columns stagger vertically   (default)
 *   "flat"    columns stagger horizontally
 *
 * `shape` — which cells exist:
 *   { type: "rhombus", width, height }  — a parallelogram of hexes
 *   { type: "hexagon", radius }         — a symmetric hex ring (radius 1 = 7 cells)
 *   { type: "triangle", size }          — triangular board
 *
 * Coordinates use axial notation: "q,r" e.g. "0,0", "-1,2".
 */
export interface HexGrid {
  type: "hexGrid";
  shape:
    | { type: "rhombus";  width: number; height: number }
    | { type: "hexagon";  radius: number }
    | { type: "triangle"; size: number };
  layout?: "pointy" | "flat";
  coordinates?: "axial" | "offset";
}

/**
 * A one-dimensional sequence of cells, numbered 1..length.
 * Useful for track-based games.
 *
 * Used by: Backgammon (24 points), simplified Mancala
 *
 * `wrapping` — whether the track loops (point 24 connects back to point 1).
 */
export interface LinearTrack {
  type: "linear";
  length: number;
  wrapping?: boolean;
}

/**
 * An arbitrary graph of named nodes.
 * The most flexible space type — any topology can be expressed.
 *
 * Used by: Nine Men's Morris (24 specific named intersections),
 *          Halma star-shaped board, any game with unusual topology.
 *
 * `directed` — if true, edges are one-way. Default: false (undirected).
 */
export interface GraphSpace {
  type: "graph";
  nodes: string[];             // cell names, e.g. ["a1","b1","mill-a"]
  edges: [string, string][];   // pairs of connected nodes
  directed?: boolean;
}

// ─── Zones ────────────────────────────────────────────────────────────────────

/**
 * A Zone is a named subset of cells with game-semantic meaning.
 *
 * Examples
 * ─────────
 *   { id: "promotionRank", for: "white", cells: { type: "rank", rank: 8 } }
 *   { id: "homeRank",      for: "black", cells: { type: "rank", rank: 1 } }
 *   { id: "center",    cells: { type: "cells", list: ["d4","d5","e4","e5"] } }
 *   { id: "blackSide",     cells: { type: "halfBoard", player: "black" } }
 *
 * `for` — optional player this zone is "relative to" (flips for the other
 *   player when comparing, e.g. each player's own promotion rank).
 */
export interface Zone {
  id: string;
  label?: string;
  for?: string;              // player this zone is anchored to
  cells: ZoneDefinition;
}

export type ZoneDefinition =
  | { type: "cells";    list: string[] }       // explicit list: ["d4","e4","d5","e5"]
  | { type: "rank";     rank: number }          // entire rank (row)
  | { type: "file";     file: string }          // entire file (column)
  | { type: "ranks";    from: number; to: number }
  | { type: "files";    from: string; to: string }
  | { type: "edge" }                            // all edge cells of a square grid
  | { type: "corner" }                          // just the four corners
  | { type: "halfBoard"; player: string }       // one player's starting half
  | { type: "union"; of: (ZoneRef | ZoneDefinition)[] }
  | { type: "intersection"; of: (ZoneRef | ZoneDefinition)[] };
