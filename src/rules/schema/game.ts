/**
 * Game — the top-level schema that assembles all building blocks.
 *
 * Design intent
 * ─────────────
 * The GameSchema is the document a game designer writes.  It references
 * all the other building blocks by name and composes them into a complete
 * playable game definition.
 *
 * Structure
 * ─────────
 *   identity    id, name, version, description, players
 *   space       the board topology + named zones
 *   pieces      what game objects exist
 *   relations   reusable named relations (cell neighborhoods)
 *   setup       initial piece placement
 *   vars        named game-state variables (for game-specific tracking)
 *   moves       what players can do
 *   turns       who goes when
 *   phases      optional: distinct game stages with different available moves
 *   end         when the game terminates
 *   result      who wins (and how to handle ties)
 *
 * Turn structure vs phases
 * ────────────────────────
 * `turns` describes the micro-level alternation: "black, then white, repeat".
 * `phases` describe the macro-level game arc: "setup phase, then play phase".
 *
 * In many games (Ataxx, Reversi, Go) there is only one phase and no setup
 * phase.  In Nine Men's Morris there are three phases: placement, movement,
 * and flying.  The phase system handles this without ad-hoc conditionals.
 *
 * End conditions vs result
 * ────────────────────────
 * `end` is a list of conditions.  When ANY is true, the game terminates.
 * `result` is evaluated ONCE after termination to determine the winner.
 *
 * This separation allows the same result rule to apply regardless of WHY
 * the game ended (board full? clock? elimination? — all → count pieces).
 *
 * State variables
 * ───────────────
 * Most games need no custom variables.  But some require tracking:
 *   En passant target square (Chess)
 *   Ko cell (Go)
 *   Castling rights (Chess)
 *   Number of consecutive passes (Go)
 *   Repetition count (for draw detection)
 *
 * `vars` declares these; `setVar` effects write them; `varEquals` conditions
 * read them.  The runtime stores them as part of the game state.
 */

import type { PlayerRef, PieceRef, ZoneRef, MoveRef, NumExpr, CompareOp } from "./primitives";
import type { Space, Zone } from "./space";
import type { Relation } from "./relation";
import type { PieceType } from "./pieces";
import type { Condition } from "./logic";
import type { Move } from "./moves";

// ─── Turn structure ───────────────────────────────────────────────────────────

/**
 * Describes who acts and in what order.
 *
 *   alternating    — classic 2-player: ABABAB…
 *   roundRobin     — N players in declared order: ABCABC…
 *   custom         — explicit FSM: each state names the acting player and
 *                    the next state after a move; allows bonus turns, skip, etc.
 */
export type TurnStructure =
  | { type: "alternating"; startsWith: PlayerRef }
  | { type: "roundRobin";  order: string[] }
  | { type: "simultaneous" }   // all players act at once (rare in abstract games)
  | { type: "custom"; states: TurnState[] };

export interface TurnState {
  id: string;
  actor: PlayerRef;    // who acts in this state
  after: string;       // which state follows after a move
  initial?: boolean;   // marks the starting state
}

// ─── Game phases ──────────────────────────────────────────────────────────────

/**
 * A Phase is a named period of the game where specific moves are available.
 *
 * Phases transition when a condition becomes true.  The final phase has
 * no `next` — when it ends, the game ends.
 *
 * Examples
 * ─────────
 * Nine Men's Morris:
 *   phase 1 "placement"  — players take turns placing pieces; ends when both
 *                          players have placed all 9 pieces
 *   phase 2 "movement"   — players slide pieces; ends when a player drops to 3
 *   phase 3 "flying"     — player with 3 pieces can jump anywhere
 *
 * Chess:
 *   single "play" phase (no explicit phases needed)
 *
 * Shogi:
 *   single "play" phase with drop moves always available
 */
export interface Phase {
  id: string;
  label: string;
  /** Which moves are available to act in this phase.  Applies to all players. */
  moves: MoveRef[];
  /** When this condition becomes true, the phase transitions. */
  endsWhen: Condition;
  /** Id of the next phase.  Absent means game ends when this phase ends. */
  next?: string;
}

// ─── End conditions ───────────────────────────────────────────────────────────

/**
 * An EndCondition specifies when the game terminates.
 * The game ends as soon as ANY end condition is satisfied.
 * After termination, the result rule evaluates who won.
 */
export type EndCondition =
  /** Game ends when every cell has at least one piece. */
  | { type: "boardFull" }

  /** Game ends when the board has no pieces at all. */
  | { type: "boardEmpty" }

  /** Game ends when a player's piece count reaches a threshold. */
  | { type: "pieceCount"; piece: PieceRef; owner: PlayerRef; op: CompareOp; count: NumExpr }

  /** Game ends when a player has no legal moves from a named subset. */
  | { type: "playerNoMove"; player: PlayerRef; moves: MoveRef[] }

  /** Game ends when NO player has any legal moves (deadlock). */
  | { type: "allPlayersNoMove"; moves: MoveRef[] }

  /** Game ends after a fixed number of turns. */
  | { type: "turnLimit"; turns: NumExpr }

  /** Game ends when a score threshold is reached. */
  | { type: "scoreReached"; player: PlayerRef; op: CompareOp; value: NumExpr }

  /** Game ends when a specific connectivity condition is met (Hex win). */
  | { type: "connectivity"; owner: PlayerRef; fromZone: ZoneRef; toZone: ZoneRef; piece?: PieceRef }

  /** Game ends when consecutive passes equal threshold (Go: 2 passes = game over). */
  | { type: "consecutivePasses"; count: number }

  /** Game ends when an arbitrary condition is true. */
  | { type: "condition"; condition: Condition };

// ─── Result rule ──────────────────────────────────────────────────────────────

/**
 * A ResultRule determines the winner once the game has ended.
 *
 * Evaluated exactly once, after the end condition triggers.
 * The runtime passes the final state; the result rule computes the outcome.
 */
export type ResultRule =
  /** The player with the most pieces of a given type wins. */
  | { type: "maxPieceCount"; piece: PieceRef; tie?: "draw" | "lastWins" }

  /** The player with the fewest pieces loses (or: last to have pieces wins). */
  | { type: "minPieceCount"; piece: PieceRef; tie?: "draw" }

  /** The player with the highest score wins. */
  | { type: "maxScore"; tie?: "draw" }

  /** The player with the lowest score wins. */
  | { type: "minScore"; tie?: "draw" }

  /** A specific player wins unconditionally (useful for race/connectivity). */
  | { type: "playerWins"; player: PlayerRef }

  /** The player who just moved loses (for impartial games: Nim, misère). */
  | { type: "lastMoverLoses" }

  /** The player who just moved wins (for normal play convention). */
  | { type: "lastMoverWins" }

  /** The player who made the current player unable to move wins. */
  | { type: "currentPlayerLoses" }

  /** Evaluate a list of conditions in priority order; first true → that player wins. */
  | { type: "firstMatch"; cases: Array<{ condition: Condition; winner: PlayerRef }>; else?: "draw" };

// ─── State variables ──────────────────────────────────────────────────────────

/**
 * A named game-state variable tracked by the runtime.
 * Declared here; read by `varEquals` conditions; written by `setVar` effects.
 */
export interface StateVar {
  name: string;
  type: "int" | "bool" | "cell" | "player";
  initial: number | boolean | string | null;
  description?: string;
}

// ─── Setup entry ──────────────────────────────────────────────────────────────

/**
 * One initial piece placement.
 *
 * `at` accepts:
 *   - a single coordinate:  "a1"
 *   - a list of coords:     ["a1","g7"]
 *   - a zone name:          "homeRank"  (places one piece on EVERY cell in the zone)
 */
export interface SetupEntry {
  place: PieceRef;
  owner: PlayerRef;
  at: string | string[];
}

// ─── Top-level Game Schema ────────────────────────────────────────────────────

/**
 * The complete definition of a game.
 *
 * This is the document a game designer authors.  The compiler reads it and
 * produces a runtime plan + a generated rulebook.
 */
export interface GameSchema {
  /** Schema format version.  Must be "2" for this schema system. */
  version: "2";

  // ── Identity ───────────────────────────────────────────────────────────────
  id: string;
  name: string;
  description?: string;

  /** Ordered list of player names.  The order determines turn priority. */
  players: string[];

  // ── Space ──────────────────────────────────────────────────────────────────
  space: Space;
  zones?: Zone[];

  // ── Pieces ─────────────────────────────────────────────────────────────────
  pieceTypes: PieceType[];

  // ── Named relations ────────────────────────────────────────────────────────
  /**
   * Reusable relation definitions, referenced by name in selectors.
   * Any RelationInput that is a string looks here.
   */
  relations?: Record<string, Relation>;

  // ── State variables ────────────────────────────────────────────────────────
  /** Named game variables beyond the board and turn counter. */
  vars?: StateVar[];

  // ── Setup ──────────────────────────────────────────────────────────────────
  setup: SetupEntry[];

  // ── Moves ──────────────────────────────────────────────────────────────────
  moves: Move[];

  // ── Turn & phase structure ─────────────────────────────────────────────────
  turns: TurnStructure;

  /**
   * Optional phases.  If absent, all moves are always available.
   * If present, moves only appear in their declared phase.
   */
  phases?: Phase[];

  // ── Game termination ───────────────────────────────────────────────────────
  /** The game ends when the first of these conditions becomes true. */
  end: EndCondition[];

  /** How to determine the winner after the game ends. */
  result: ResultRule;

  // ── Metadata ───────────────────────────────────────────────────────────────
  tags?: string[];     // "abstract", "2-player", "placement", "connection", etc.
  minPlayers?: number;
  maxPlayers?: number;
}
