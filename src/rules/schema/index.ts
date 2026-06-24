/**
 * Public surface of the v2 schema system.
 *
 * Import everything from here:
 *   import type { GameSchema, Move, Effect, Condition } from "../schema";
 */

export type { PlayerRef, PieceRef, RelationRef, ZoneRef, MoveRef, NumExpr, CompareOp } from "./primitives";
export { isCellVar, evalCompare } from "./primitives";

export type { Space, SquareGrid, HexGrid, LinearTrack, GraphSpace, Zone, ZoneDefinition } from "./space";

export type { Relation, RelationInput } from "./relation";

export type { PieceType } from "./pieces";

export type { CellSelector, Condition } from "./logic";

export type { Effect } from "./effects";

export type { Binding, Move, MoveInstance } from "./moves";

export type {
  TurnStructure,
  TurnState,
  Phase,
  EndCondition,
  ResultRule,
  StateVar,
  SetupEntry,
  GameSchema,
} from "./game";
