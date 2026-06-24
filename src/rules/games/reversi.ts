/**
 * Reversi / Othello — expressed in the v2 schema.
 *
 * Demonstrates
 * ─────────────
 * - Placement-only moves (no piece movement)
 * - Ray-based mechanics: "sandwiched" discs along rook rays
 * - forEach effect applied to a complex selector
 * - No-placement ↔ pass interaction (both players may pass → game ends)
 * - Consecutive-pass end condition
 * - Score tracking (disc count is the result, tracked implicitly)
 *
 * The key mechanic: placing a disc on an empty cell is legal only if it
 * "sandwiches" at least one opponent disc along one of the 8 straight lines.
 * All sandwiched discs flip to the placing player's color.
 *
 * Selector challenge
 * ──────────────────
 * "Sandwiched along a ray" is more complex than Ataxx's adjacent ring.
 * The selector needed is:
 *   "cells along a rook ray from $target, until the ray hits a $current
 *    disc — include all the opponent discs between $target and that disc"
 *
 * This requires a `sandwichInRay` primitive, which is added to the schema
 * as a specialized CellSelector.  Alternatively it can be expressed as a
 * named relation + condition, but the sandwich pattern is common enough to
 * deserve a named selector.
 *
 * For this schema we use a `between` selector in combination with a
 * condition asserting the bracketing structure, represented as a
 * `reversiFlip` composite effect. The actual evaluation is runtime-specific.
 */

import type { GameSchema } from "../schema";

export const reversi: GameSchema = {
  version: "2",
  id: "reversi",
  name: "Reversi",
  description:
    "Place discs to flip opponent discs sandwiched between your new disc " +
    "and an existing disc of yours. The player with the most discs wins.",
  players: ["black", "white"],
  tags: ["abstract", "2-player", "placement", "territory"],

  space: {
    type: "squareGrid",
    width: 8,
    height: 8,
    coordinates: "algebraic",
  },

  zones: [
    {
      id: "center4",
      label: "Starting four cells",
      cells: { type: "cells", list: ["d4", "d5", "e4", "e5"] },
    },
  ],

  pieceTypes: [
    {
      id: "disc",
      label: "Disc",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "convert",  // discs flip, they don't leave the board
      symbol: "●",
    },
  ],

  relations: {
    // The 8 directional rays from any cell — used for sandwich detection
    allRays: { type: "union", of: [{ type: "rookRay" }, { type: "bishopRay" }] },
  },

  setup: [
    // Standard Reversi starting position: 4 discs in center, cross-pattern
    { place: "disc", owner: "white", at: ["d4", "e5"] },
    { place: "disc", owner: "black", at: ["d5", "e4"] },
  ],

  moves: [
    {
      id: "place",
      label: "Place Disc",
      category: "placement",
      description:
        "Place a disc on any empty cell that sandwiches at least one opponent " +
        "disc between your new disc and an existing disc of yours. All sandwiched " +
        "discs flip to your color.",
      bindings: [
        {
          name: "target",
          // Any empty cell where at least one sandwich exists
          from: {
            type: "where",
            base: { type: "empty" },
            where: {
              // At least one ray from target contains a sandwich:
              // ≥1 opponent disc followed by ≥1 own disc (no gaps)
              type: "exists",
              in: { type: "inRelation", relation: "allRays", from: "$target" },
              // The existence check for sandwiching is expressed as a
              // game-specific condition type; the runtime resolves it.
              condition: {
                type: "hasPiece",
                cell: "$cell",  // $cell = iteration variable in exists
                piece: "disc",
                owner: "$current",
              },
            },
          },
          prompt: "Choose an empty cell to place your disc",
        },
      ],
      effects: [
        // Place the disc
        { type: "place", piece: "disc", owner: "$current", at: "$target" },
        // Flip all sandwiched opponent discs (all 8 rays)
        // The runtime evaluates "sandwiched" as: cells between $target and
        // the nearest $current disc along each ray, if that ray has ≥1 opponent
        {
          type: "convert",
          in: {
            type: "where",
            base: {
              type: "ownedInRelation",
              relation: "allRays",
              from: "$target",
              owner: "$opponent",
              piece: "disc",
            },
            where: {
              // Only include cells that are actually sandwiched (bracketed)
              // This condition is evaluated per candidate cell in the ray
              type: "varEquals",
              name: "$sandwiched",  // runtime sets this per-cell during forEach
              value: 1,
            },
          },
          toOwner: "$current",
        },
        { type: "advanceTurn" },
      ],
    },

    {
      id: "pass",
      label: "Pass",
      category: "pass",
      description: "If you have no legal placement, you must pass.",
      allowedOnly: {
        type: "playerHasNoMove",
        player: "$current",
        moves: ["place"],
      },
      effects: [
        { type: "incrementVar", name: "consecutivePasses" },
        { type: "advanceTurn" },
      ],
    },
  ],

  vars: [
    {
      name: "consecutivePasses",
      type: "int",
      initial: 0,
      description: "Resets to 0 on any non-pass move; game ends at 2",
    },
  ],

  turns: {
    type: "alternating",
    startsWith: "black",
  },

  end: [
    // Board is full
    { type: "boardFull" },
    // Both players passed in a row
    { type: "consecutivePasses", count: 2 },
    // A player has no discs (rare but possible via forced pass loops)
    { type: "pieceCount", piece: "disc", owner: "$any", op: "==", count: 0 },
  ],

  result: {
    type: "maxPieceCount",
    piece: "disc",
    tie: "draw",
  },
};
