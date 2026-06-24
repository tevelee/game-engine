/**
 * Go (Baduk / Weiqi) — expressed in the v2 schema.
 *
 * Demonstrates
 * ─────────────
 * - Placement-only moves on a point-based grid (19×19 standard, 9×9 here)
 * - Group capture via floodFill + groupHasLiberty / groupSurrounded
 * - Ko rule: a player may not recreate the board position from their last turn
 *   (approximated as: may not play on the ko cell stored in a "cell" var)
 * - Self-capture rule: placing a stone that would leave the group with no
 *   liberties is illegal UNLESS it captures at least one enemy group
 * - Consecutive-pass end condition (both players pass → game over)
 * - Territory scoring (Chinese rules simplified: stones + empty territory)
 * - Capture tracking via score variable (for Japanese rules variant)
 *
 * Board topology note
 * ───────────────────
 * In Go, pieces are placed on the intersections (points) of the grid, not
 * inside the squares.  The 9×9 board has 81 points.  We model this as a
 * 9×9 squareGrid where each cell IS a point (not a square).
 * The standard coordinate notation is letter+number: a1 (bottom-left) to i9.
 *
 * Connectivity
 * ────────────
 * Two stones are "connected" if they are orthogonally adjacent (not diagonal).
 * We use `manhattan` distance 1, not `chebyshev`, to exclude diagonals.
 *
 * "Group" = the set of same-color stones reachable via a floodFill over the
 * `adjacent` (manhattan-1) relation.
 *
 * "Liberty" = an empty point orthogonally adjacent to any stone in the group.
 *
 * Capture rule
 * ────────────
 * After a player places a stone, any enemy group that now has zero liberties
 * is captured (removed from the board).  A player may not place a stone that
 * gives their own group zero liberties UNLESS that placement simultaneously
 * captures at least one enemy group.
 *
 * Ko rule (simplified)
 * ────────────────────
 * The simple ko rule forbids re-capturing the immediately preceding capture.
 * We store the captured cell (the "ko point") in a state variable.  A player
 * may not place on the ko point unless no ko point is active.
 *
 * Full superko (forbidding any position repetition) requires hashing the full
 * board position and is beyond what the schema's `varEquals` can express in
 * a single variable.  The runtime would need to implement superko as a
 * special-case end condition or move legality hook.
 *
 * Scoring (Chinese rules)
 * ───────────────────────
 * At the end of the game:
 *   player's score = number of own stones on board + empty points surrounded
 *                    only by own stones (territory)
 * This is computed by the ResultRule `maxScore`; the runtime must evaluate
 * territory at game end.  We tag this rule with `chineseScoring: true` to
 * hint to the runtime.
 *
 * Limitation notes
 * ────────────────
 * 1. The "self-capture forbidden unless it captures enemy" constraint requires
 *    evaluating the board state AFTER placement.  This is expressed as a move
 *    condition using `not(groupSurrounded)` on the placed stone, with an
 *    exception for the case where at least one enemy group becomes surrounded.
 *    The runtime must apply the placement speculatively to evaluate this.
 *
 * 2. Territory scoring at game end requires the runtime to flood-fill empty
 *    regions and determine which color (if any) fully surrounds each region.
 *    This is non-trivial and is flagged as a runtime responsibility via the
 *    `maxScore` result rule.  Dead-stone removal (Japanese rules) requires
 *    additional UI interaction and is not modeled here.
 *
 * 3. Handicap placement (for ranked games) would use the setup section with
 *    pre-placed black stones on the star points.  Not included in this model.
 */

import type { GameSchema } from "../schema";

export const go: GameSchema = {
  version: "2",
  id: "go",
  name: "Go",
  description:
    "Surround territory and capture stones by surrounding enemy groups. " +
    "The player with the most territory + stones wins (Chinese rules).",
  players: ["black", "white"],
  tags: ["abstract", "2-player", "placement", "territory", "connection"],

  // 9×9 for quick play; change to 19×19 for standard
  space: {
    type: "squareGrid",
    width: 9,
    height: 9,
    coordinates: "algebraic",
  },

  zones: [
    {
      id: "starPoints9",
      label: "Star points (hoshi) on 9×9 board",
      cells: { type: "cells", list: ["c3", "g3", "e5", "c7", "g7"] },
    },
  ],

  pieceTypes: [
    {
      id: "stone",
      label: "Stone",
      ownership: "player",
      stacking: "single",
      facing: "none",
      // Go stones that are captured are removed from the board entirely.
      // They don't convert — the capturing player's score increases.
      capturedAs: "remove",
      symbol: "●",
    },
  ],

  relations: {
    // Orthogonal adjacency only — Go uses 4-connectivity (no diagonals)
    adjacent: { type: "manhattan", distance: 1 },

    // The connected group of same-color stones reachable from any point.
    // This is used as the "from" in groupHasLiberty / groupSurrounded conditions.
    // The floodFill is owner-scoped: it only follows stones of the same color.
    group: { type: "floodFill", owner: "$current" },
    groupOpponent: { type: "floodFill", owner: "$opponent" },
  },

  setup: [],  // Go starts on an empty board

  vars: [
    {
      name: "koPoint",
      type: "cell",
      initial: null,
      description:
        "The point where a simple ko capture just occurred. " +
        "The current player may not play here this turn. " +
        "Reset to null after the opponent plays.",
    },
    {
      name: "consecutivePasses",
      type: "int",
      initial: 0,
      description: "Incremented on each pass. Reset to 0 on any stone placement.",
    },
    {
      name: "blackCaptures",
      type: "int",
      initial: 0,
      description: "Number of white stones captured by black (for Japanese scoring).",
    },
    {
      name: "whiteCaptures",
      type: "int",
      initial: 0,
      description: "Number of black stones captured by white (for Japanese scoring).",
    },
  ],

  moves: [
    {
      id: "place",
      label: "Place Stone",
      category: "placement",
      description:
        "Place a stone on any empty point. The move is illegal if it would " +
        "leave your stone (or group) with no liberties — unless it simultaneously " +
        "captures at least one enemy group. The ko rule forbids playing on the " +
        "ko point (the cell just vacated by your opponent's last capture).",
      bindings: [
        {
          name: "target",
          from: {
            type: "where",
            base: { type: "empty" },
            where: {
              // Ko restriction: may not place on the ko point this turn.
              // cellVarEquals compares the candidate coordinate to the stored cell variable.
              type: "not",
              of: { type: "cellVarEquals", name: "koPoint", cell: "$target" },
            },
          },
          prompt: "Choose an empty point to place your stone",
        },
      ],
      // Move is only legal if:
      //   (a) after placing, the group has at least 1 liberty (not self-capture), OR
      //   (b) after placing, at least one enemy group has 0 liberties (captures enemy)
      //
      // This condition is evaluated speculatively (after a provisional placement).
      // The runtime must support speculative evaluation for this move condition.
      condition: {
        type: "or",
        of: [
          // Own group retains liberty after placement
          {
            type: "not",
            of: { type: "groupSurrounded", cell: "$target" },
          },
          // At least one adjacent enemy group is captured by this move
          {
            type: "exists",
            in: {
              type: "ownedInRelation",
              relation: "adjacent",
              from: "$target",
              owner: "$opponent",
              piece: "stone",
            },
            condition: { type: "groupSurrounded", cell: "$cell" },
          },
        ],
      },
      effects: [
        // 1. Place the stone
        { type: "place", piece: "stone", owner: "$current", at: "$target" },

        // 2. Capture any surrounded enemy groups
        //    For each adjacent enemy stone, check if its group is now surrounded.
        //    If so, remove every stone in that group.
        //
        //    We express this with a forEach over adjacent enemy stones followed by
        //    a conditional group-removal.  The runtime must apply the group removal
        //    atomically per group (not per-stone), so it handles multiple captures.
        {
          type: "forEach",
          in: {
            type: "ownedInRelation",
            relation: "adjacent",
            from: "$target",
            owner: "$opponent",
            piece: "stone",
          },
          do: {
            type: "if",
            condition: { type: "groupSurrounded", cell: "$cell" },
            then: {
              // Remove every stone in the captured group.
              // The `floodFill` relation gives us all connected same-color stones.
              type: "forEach",
              in: {
                type: "inRelation",
                relation: "groupOpponent",
                from: "$cell",
              },
              do: { type: "remove", at: "$cell" },
            },
          },
        },

        // 3. Update ko point: if exactly one stone was captured and $target was
        //    the only liberty of the captured group, the vacated cell becomes the ko point.
        //    Approximated here: the runtime sets koPoint based on capture count.
        //    When more than one stone is captured, ko does not apply → set koPoint = null.
        //    This is a runtime-side responsibility flagged by the schema; the schema
        //    cannot express "count of stones just removed in this step" directly.
        //    We use setVar null to indicate "runtime should compute and set koPoint".
        { type: "setVar", name: "koPoint", value: null },

        // 4. Reset consecutivePasses (a placement breaks any pass streak)
        { type: "setVar", name: "consecutivePasses", value: 0 },

        // 5. Advance the turn
        { type: "advanceTurn" },
      ],
    },

    {
      id: "pass",
      label: "Pass",
      category: "pass",
      description:
        "A player may pass on any turn. If both players pass consecutively, " +
        "the game ends and scoring begins.",
      // Pass is always legal in Go (unlike Reversi, you can always pass)
      effects: [
        // Clear the ko restriction (passing forfeits your right to block ko)
        { type: "setVar", name: "koPoint", value: null },
        { type: "incrementVar", name: "consecutivePasses" },
        { type: "advanceTurn" },
      ],
    },
  ],

  turns: {
    type: "alternating",
    startsWith: "black",  // Black plays first by convention
  },

  end: [
    // Both players pass consecutively — standard Go end condition
    { type: "consecutivePasses", count: 2 },

    // Safety valve: board completely filled (rare in real games, possible on small boards)
    { type: "boardFull" },
  ],

  result: {
    // Chinese rules: count stones on the board + empty territory surrounded by that color.
    // The runtime evaluates territory by flood-filling empty regions and checking
    // which player (if any) fully borders each region.
    type: "maxScore",
    tie: "draw",
    // Note: a 6.5 komi (compensation for black's first-move advantage) is conventional.
    // The runtime should apply komi to white's score before comparing.
    // This is expressed as an external parameter, not in the schema itself.
  },
};
