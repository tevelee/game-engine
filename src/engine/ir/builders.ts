/**
 * Convenience re-export of the entire builder surface.
 *
 * Games that don't want to track per-module imports can import everything from
 * here. Games that want to make their module dependencies explicit (like
 * games.ataxx.v1) import directly from the kernel and std lib modules.
 *
 * Module layout:
 *   rules.kernel.v1              → ../kernel/builders
 *   std.players.two.v1           → ../std/players
 *   std.turns.alternating.v1     → ../std/turns
 *   std.board.squareGrid.v1      → ../std/board
 *   std.spatial.distance.v1      → ../std/spatial
 *   std.pieces.ownedGridPieces.v1 → ../std/pieces
 *   std.actions.noLegalActions.v1 → ../std/actions
 *   std.scoring.pieceCount.v1    → ../std/scoring
 */

export * from "../kernel/builders";
export * from "../std/players";
export * from "../std/turns";
export * from "../std/board";
export * from "../std/spatial";
export * from "../std/pieces";
export * from "../std/actions";
export * from "../std/scoring";
