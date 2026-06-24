/**
 * Example game definitions expressed in the v2 schema.
 *
 * These serve as both reference implementations and regression fixtures:
 * any schema change that breaks a game definition is caught at compile time.
 *
 * Games by mechanic category:
 *   ataxx   — clone/jump, convert-in-relation, allPlayersNoMove end
 *   reversi — sandwich flip, consecutivePasses end, ray-based selectors
 *   chess   — multi-piece-type, promotion, forward/diagonal relations, vars
 *   go      — floodFill capture, groupHasLiberty, ko var, territory scoring
 */

export { ataxx } from "./ataxx";
export { reversi } from "./reversi";
export { chess } from "./chess";
export { go } from "./go";
