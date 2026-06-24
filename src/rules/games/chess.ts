/**
 * Chess — expressed in the v2 schema.
 *
 * Demonstrates
 * ─────────────
 * - Multiple piece types with different movement rules
 * - forPiece binding (move is specific to one piece type)
 * - Player-relative directions (forward, forwardDiagonal) for pawn
 * - Ray sliding (rookRay, bishopRay, queenRay) with blocking
 * - Discrete leaps (knight, king)
 * - Promotion (pawn enters promotionRank → becomes queen/rook/bishop/knight)
 * - Zone-based filtering (pawn double-push only from homeRank)
 * - capture effect (remove opponent piece + move own piece)
 * - Condition: move legality check (would-be-in-check filter, not yet fully expressed)
 * - Phase-less game (single continuous play phase)
 * - Custom result rule: capturedTarget (king)
 * - Multiple end conditions: playerNoMove (stalemate), capturedKing
 *
 * Scope note
 * ──────────
 * This schema expresses standard chess movement and captures.  Some rules
 * that require additional state tracking are noted but not yet fully wired:
 *
 *   En passant   — requires tracking the last pawn double-push target square
 *                  via a var, and a special move that reads it
 *   Castling     — requires tracking whether king/rooks have moved (vars)
 *                  and that the king is not in check (condition on path)
 *   Check        — the condition "after this move, my king would not be in
 *                  check" must be attached to every move via `condition`
 *
 * These are annotated where relevant.  The schema structure supports them;
 * a more complete compiler would evaluate the check condition via simulation.
 */

import type { GameSchema } from "../schema";

export const chess: GameSchema = {
  version: "2",
  id: "chess",
  name: "Chess",
  description:
    "The classic 2-player strategy game on an 8×8 grid. Move pieces to " +
    "threaten and capture the opponent's king.",
  players: ["white", "black"],
  tags: ["abstract", "2-player", "classic", "deterministic"],

  space: {
    type: "squareGrid",
    width: 8,
    height: 8,
    coordinates: "algebraic",
  },

  zones: [
    // Promotion zones (each player's far rank)
    { id: "whitePromotion", for: "white", cells: { type: "rank", rank: 8 } },
    { id: "blackPromotion", for: "black", cells: { type: "rank", rank: 1 } },
    // Starting ranks for pawns (for double-push detection)
    { id: "whitePawnRank", for: "white", cells: { type: "rank", rank: 2 } },
    { id: "blackPawnRank", for: "black", cells: { type: "rank", rank: 7 } },
  ],

  pieceTypes: [
    {
      id: "pawn",
      label: "Pawn",
      ownership: "player",
      stacking: "single",
      facing: "forward",          // orientation matters: pawn moves "forward"
      capturedAs: "remove",
      promotion: {
        when: "entersZone",
        zone: "whitePromotion",   // compiler mirrors to blackPromotion for black
        intoAny: ["queen", "rook", "bishop", "knight"],
      },
      symbol: "♟",
    },
    {
      id: "knight",
      label: "Knight",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "remove",
      symbol: "♞",
    },
    {
      id: "bishop",
      label: "Bishop",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "remove",
      symbol: "♝",
    },
    {
      id: "rook",
      label: "Rook",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "remove",
      symbol: "♜",
    },
    {
      id: "queen",
      label: "Queen",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "remove",
      symbol: "♛",
    },
    {
      id: "king",
      label: "King",
      ownership: "player",
      stacking: "single",
      facing: "none",
      capturedAs: "remove",
      symbol: "♚",
      value: 1000,  // high value signals "this is the target piece"
    },
  ],

  relations: {
    // ── Pawn movement ────────────────────────────────────────────────
    // One step directly forward (player-relative direction)
    pawnPush: { type: "forward", steps: 1 },

    // Two steps forward from starting rank
    pawnDoublePush: { type: "forward", steps: 2, onlyFrom: "whitePawnRank" },
    // Note: onlyFrom is mirrored for black by the compiler

    // Diagonal captures (one step forward-diagonal)
    pawnCapture: { type: "forwardDiagonal", steps: 1 },

    // ── Knight ───────────────────────────────────────────────────────
    // L-shape: all 8 rotations of the (2,1) leap
    knightLeap: { type: "leap", dx: 2, dy: 1, rotations: "all8" },

    // ── Sliding pieces ───────────────────────────────────────────────
    // Rook: orthogonal slide (blocked by any piece, can capture on first hit)
    rookSlide: { type: "rookRay", blockedBy: "any" },

    // Bishop: diagonal slide
    bishopSlide: { type: "bishopRay", blockedBy: "any" },

    // Queen: union of rook + bishop
    queenSlide: {
      type: "union",
      of: [{ type: "rookRay", blockedBy: "any" }, { type: "bishopRay", blockedBy: "any" }],
    },

    // ── King ─────────────────────────────────────────────────────────
    // One step in any of the 8 directions
    kingStep: { type: "chebyshev", distance: 1 },
  },

  vars: [
    // En passant: the cell a pawn can be captured on as it passes
    // Set to the skipped cell after a double-push; cleared after each move
    {
      name: "enPassantTarget",
      type: "cell",
      initial: null,
      description: "Cell behind the last pawn to double-push; valid for one move",
    },
    // Castling rights (bitmask: white-kingside=1, white-queenside=2, etc.)
    {
      name: "castlingRights",
      type: "int",
      initial: 15,    // 0b1111 = all four castling options intact
      description: "Cleared when the relevant king or rook first moves",
    },
  ],

  setup: [
    // White back rank
    { place: "rook",   owner: "white", at: ["a1", "h1"] },
    { place: "knight", owner: "white", at: ["b1", "g1"] },
    { place: "bishop", owner: "white", at: ["c1", "f1"] },
    { place: "queen",  owner: "white", at: "d1" },
    { place: "king",   owner: "white", at: "e1" },
    // White pawns
    { place: "pawn",   owner: "white", at: ["a2","b2","c2","d2","e2","f2","g2","h2"] },
    // Black back rank
    { place: "rook",   owner: "black", at: ["a8", "h8"] },
    { place: "knight", owner: "black", at: ["b8", "g8"] },
    { place: "bishop", owner: "black", at: ["c8", "f8"] },
    { place: "queen",  owner: "black", at: "d8" },
    { place: "king",   owner: "black", at: "e8" },
    // Black pawns
    { place: "pawn",   owner: "black", at: ["a7","b7","c7","d7","e7","f7","g7","h7"] },
  ],

  moves: [
    // ── Pawn: quiet push ──────────────────────────────────────────────────
    {
      id: "pawnPush",
      label: "Pawn Push",
      forPiece: "pawn",
      category: "move",
      description: "Move a pawn one square forward to an empty cell.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "pawn", owner: "$current" },
          prompt: "Choose a pawn to push",
        },
        {
          name: "target",
          from: { type: "emptyInRelation", relation: "pawnPush", from: "$source" },
          prompt: "Push one square forward",
        },
      ],
      effects: [
        { type: "move", from: "$source", to: "$target" },
        // Clear the en passant target (no double push happened)
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    // ── Pawn: double push from starting rank ──────────────────────────────
    {
      id: "pawnDoublePush",
      label: "Pawn Double Push",
      forPiece: "pawn",
      category: "move",
      description: "Move a pawn two squares forward from its starting rank.",
      bindings: [
        {
          name: "source",
          // Only pawns on their starting rank can double-push
          from: {
            type: "and",
            of: [
              { type: "withPiece", piece: "pawn", owner: "$current" },
              { type: "inZone", zone: "whitePawnRank" }, // compiler mirrors for black
            ],
          },
          prompt: "Choose a pawn on its starting rank",
        },
        {
          name: "target",
          // The intermediate square must also be empty (can't jump over a piece)
          from: {
            type: "where",
            base: { type: "emptyInRelation", relation: "pawnDoublePush", from: "$source" },
            where: {
              // The intermediate square (between source and target) must be empty
              type: "forAll",
              in: { type: "between", from: "$source", to: "$target" },
              condition: { type: "isEmpty", cell: "$cell" },
            },
          },
          prompt: "Push two squares forward",
        },
      ],
      effects: [
        { type: "move", from: "$source", to: "$target" },
        // Record the skipped square as the en passant target
        // The skipped square = the cell between source and target
        // This requires a "midpoint" expression — approximated via a var set
        // by the compiler based on binding coordinates
        { type: "setVar", name: "enPassantTarget", value: { stat: "varValue", name: "$skipSquare" } },
        { type: "advanceTurn" },
      ],
    },

    // ── Pawn: capture diagonally ──────────────────────────────────────────
    {
      id: "pawnCapture",
      label: "Pawn Capture",
      forPiece: "pawn",
      category: "capture",
      description: "Capture an opponent piece diagonally forward.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "pawn", owner: "$current" },
          prompt: "Choose a pawn",
        },
        {
          name: "target",
          // Must be a diagonal forward cell occupied by an opponent
          from: {
            type: "ownedInRelation",
            relation: "pawnCapture",
            from: "$source",
            owner: "$opponent",
          },
          prompt: "Capture diagonally",
        },
      ],
      effects: [
        { type: "capture", at: "$target", by: "$current" },
        { type: "move", from: "$source", to: "$target" },
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    // ── Knight ────────────────────────────────────────────────────────────
    {
      id: "knightMove",
      label: "Knight Move",
      forPiece: "knight",
      category: "move",
      description: "Jump in an L-shape (2+1 squares). Can leap over other pieces.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "knight", owner: "$current" },
          prompt: "Choose a knight",
        },
        {
          name: "target",
          // Any cell in knightLeap range that is either empty or holds an opponent piece
          from: {
            type: "and",
            of: [
              { type: "inRelation", relation: "knightLeap", from: "$source" },
              {
                type: "not",
                of: { type: "withPiece", piece: "knight", owner: "$current" },
                within: { type: "inRelation", relation: "knightLeap", from: "$source" },
              },
            ],
          },
          prompt: "Choose a target square (empty or enemy)",
        },
      ],
      effects: [
        // Capture if occupied by opponent
        {
          type: "if",
          condition: { type: "isOccupied", cell: "$target" },
          then: { type: "capture", at: "$target", by: "$current" },
        },
        { type: "move", from: "$source", to: "$target" },
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    // ── Sliding pieces (bishop, rook, queen share the same pattern) ───────
    {
      id: "bishopMove",
      label: "Bishop Move",
      forPiece: "bishop",
      category: "move",
      description: "Slide diagonally any number of squares.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "bishop", owner: "$current" },
          prompt: "Choose a bishop",
        },
        {
          name: "target",
          // Empty cells OR cells with an opponent piece along the diagonal ray
          // The `rookRay` / `bishopRay` relation already stops at the first piece;
          // the compiler resolves which cells along each ray are reachable.
          from: {
            type: "or",
            of: [
              { type: "emptyInRelation", relation: "bishopSlide", from: "$source" },
              { type: "ownedInRelation", relation: "bishopSlide", from: "$source", owner: "$opponent" },
            ],
          },
          prompt: "Choose a diagonal destination",
        },
      ],
      effects: [
        {
          type: "if",
          condition: { type: "isOccupied", cell: "$target" },
          then: { type: "capture", at: "$target", by: "$current" },
        },
        { type: "move", from: "$source", to: "$target" },
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    {
      id: "rookMove",
      label: "Rook Move",
      forPiece: "rook",
      category: "move",
      description: "Slide orthogonally any number of squares.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "rook", owner: "$current" },
          prompt: "Choose a rook",
        },
        {
          name: "target",
          from: {
            type: "or",
            of: [
              { type: "emptyInRelation", relation: "rookSlide", from: "$source" },
              { type: "ownedInRelation", relation: "rookSlide", from: "$source", owner: "$opponent" },
            ],
          },
          prompt: "Choose an orthogonal destination",
        },
      ],
      effects: [
        {
          type: "if",
          condition: { type: "isOccupied", cell: "$target" },
          then: { type: "capture", at: "$target", by: "$current" },
        },
        { type: "move", from: "$source", to: "$target" },
        // Revoke castling rights for this rook (tracked by position in a real compiler)
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    {
      id: "queenMove",
      label: "Queen Move",
      forPiece: "queen",
      category: "move",
      description: "Slide orthogonally or diagonally any number of squares.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "queen", owner: "$current" },
          prompt: "Choose the queen",
        },
        {
          name: "target",
          from: {
            type: "or",
            of: [
              { type: "emptyInRelation", relation: "queenSlide", from: "$source" },
              { type: "ownedInRelation", relation: "queenSlide", from: "$source", owner: "$opponent" },
            ],
          },
          prompt: "Choose a destination",
        },
      ],
      effects: [
        {
          type: "if",
          condition: { type: "isOccupied", cell: "$target" },
          then: { type: "capture", at: "$target", by: "$current" },
        },
        { type: "move", from: "$source", to: "$target" },
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },

    // ── King ──────────────────────────────────────────────────────────────
    {
      id: "kingMove",
      label: "King Move",
      forPiece: "king",
      category: "move",
      description: "Move the king one square in any direction.",
      bindings: [
        {
          name: "source",
          from: { type: "withPiece", piece: "king", owner: "$current" },
          prompt: "Choose the king",
        },
        {
          name: "target",
          // Any adjacent cell not occupied by own piece
          from: {
            type: "and",
            of: [
              { type: "inRelation", relation: "kingStep", from: "$source" },
              {
                type: "not",
                of: { type: "withPiece", piece: "king", owner: "$current" },
                within: { type: "inRelation", relation: "kingStep", from: "$source" },
              },
              // TODO: condition "target is not attacked by opponent"
              // This requires a `not(squareAttackedBy($opponent))` condition
              // which is expressed via `playerHasMove` checking for captures on $target
            ],
          },
          prompt: "Move the king",
        },
      ],
      effects: [
        {
          type: "if",
          condition: { type: "isOccupied", cell: "$target" },
          then: { type: "capture", at: "$target", by: "$current" },
        },
        { type: "move", from: "$source", to: "$target" },
        // Revoke both castling rights for this player when king moves
        { type: "setVar", name: "enPassantTarget", value: null },
        { type: "advanceTurn" },
      ],
    },
  ],

  turns: {
    type: "alternating",
    startsWith: "white",
  },

  end: [
    // Checkmate: current player has no legal moves AND their king is in check
    // (Simplified here as: no legal moves at all — the check detection
    //  would be embedded in each move's `condition` in a full implementation)
    { type: "playerNoMove", player: "$current", moves: ["pawnPush","pawnDoublePush","pawnCapture","knightMove","bishopMove","rookMove","queenMove","kingMove"] },

    // King captured (proxy for checkmate in this schema; real chess uses check detection)
    { type: "pieceCount", piece: "king", owner: "$any", op: "==", count: 0 },
  ],

  result: {
    // The player whose king is still on the board wins
    // (In a full implementation: "the player who delivered checkmate wins")
    type: "firstMatch",
    cases: [
      {
        condition: { type: "pieceCount", piece: "king", owner: "white", op: "==", count: 0 },
        winner: "black",
      },
      {
        condition: { type: "pieceCount", piece: "king", owner: "black", op: "==", count: 0 },
        winner: "white",
      },
    ],
    else: "draw",  // stalemate → draw
  },
};
