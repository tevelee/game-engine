/**
 * Ataxx / Infection Grid — expressed in the v2 schema.
 *
 * Demonstrates
 * ─────────────
 * - squareGrid space
 * - single piece type with no facing
 * - chebyshev relations (exact distance 1 and 2)
 * - two-binding move (source → target)
 * - convert effect (bulk ownership change in a relation)
 * - boardFull / pieceCount / allPlayersNoMove end conditions
 * - maxPieceCount result rule
 * - pass guarded by playerHasNoMove condition
 */

import type { GameSchema } from "../schema";

export const ataxx: GameSchema = {
  version: "2",
  id: "ataxx",
  name: "Ataxx",
  description:
    "A 2-player territory game on a 7×7 grid. Clone your stones by " +
    "expanding one step; jump two steps to relocate. After each placement, " +
    "adjacent enemy stones convert to your color.",
  players: ["black", "white"],
  tags: ["abstract", "2-player", "placement", "territory"],

  space: {
    type: "squareGrid",
    width: 7,
    height: 7,
    coordinates: "algebraic",
  },

  pieceTypes: [
    {
      id: "stone",
      label: "Stone",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "convert",   // adjacent stones flip, they're not removed
      symbol: "●",
    },
  ],

  relations: {
    // Cells exactly 1 king-step away (immediate neighborhood)
    adjacent: { type: "chebyshev", distance: 1 },

    // Cells exactly 2 king-steps away (jump ring)
    jumpRing: { type: "chebyshev", distance: 2 },
  },

  setup: [
    { place: "stone", owner: "black", at: ["a1", "g7"] },
    { place: "stone", owner: "white", at: ["g1", "a7"] },
  ],

  moves: [
    {
      id: "clone",
      label: "Clone",
      category: "placement",
      description:
        "Place a new stone on any empty cell exactly one step away from " +
        "one of your existing stones. Then convert all adjacent enemy stones.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "stone", owner: "$current" },
          prompt: "Choose one of your stones",
        },
        {
          name: "target",
          from: { type: "emptyInRelation", relation: "adjacent", from: "$source" },
          prompt: "Choose an empty adjacent cell to expand into",
        },
      ],
      effects: [
        // Place a new stone at target (source stone stays)
        { type: "place", piece: "stone", owner: "$current", at: "$target" },
        // Convert all adjacent enemy stones around the new stone
        {
          type: "convert",
          in: {
            type: "ownedInRelation",
            relation: "adjacent",
            from: "$target",
            owner: "$opponent",
            piece: "stone",
          },
          toOwner: "$current",
        },
        { type: "advanceTurn" },
      ],
    },

    {
      id: "jump",
      label: "Jump",
      category: "move",
      description:
        "Move one of your stones to any empty cell exactly two steps away. " +
        "Then convert all adjacent enemy stones around the destination.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "stone", owner: "$current" },
          prompt: "Choose a stone to jump",
        },
        {
          name: "target",
          from: { type: "emptyInRelation", relation: "jumpRing", from: "$source" },
          prompt: "Choose an empty cell two steps away",
        },
      ],
      effects: [
        // Move stone from source to target
        { type: "move", from: "$source", to: "$target" },
        // Convert adjacent enemy stones around destination
        {
          type: "convert",
          in: {
            type: "ownedInRelation",
            relation: "adjacent",
            from: "$target",
            owner: "$opponent",
            piece: "stone",
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
      description: "If you have no legal Clone or Jump, you must pass.",
      // Only available when the current player has no clone or jump moves
      allowedOnly: {
        type: "playerHasNoMove",
        player: "$current",
        moves: ["clone", "jump"],
      },
      effects: [{ type: "advanceTurn" }],
    },
  ],

  turns: {
    type: "alternating",
    startsWith: "black",
  },

  end: [
    // Board is completely filled
    { type: "boardFull" },
    // Any player has been eliminated
    { type: "pieceCount", piece: "stone", owner: "$any", op: "==", count: 0 },
    // Neither player can make a meaningful move
    { type: "allPlayersNoMove", moves: ["clone", "jump"] },
  ],

  result: {
    type: "maxPieceCount",
    piece: "stone",
    tie: "draw",
  },
};
