/**
 * Public API of the new module-system engine.
 *
 * Import from here:
 *   import type { IRGame, IRAction, IRSelector } from "../../engine";
 *   import { allCells, filter, exists, placePiece, seq } from "../../engine";
 *   import { printIRGame } from "../../engine";
 */

// IR types
export type {
  IRType, SourceRef,
  IRExpr, IRSelector, IRPredicate, IREffect,
  IRBinding, IRAction, IREndCondition, IRResultRule,
  IRVar, IRDefinition, IRGame,
} from "./ir/types";
export { currentPlayerExpr, opponentExpr, turnNumberExpr } from "./ir/types";

// Builder functions
export {
  $, lit, global, currentPlayer, opponent, turnNumber,
  allCells, emptyCells, cellsAtDistance,
  rookRayCells, bishopRayCells, rayCells, connectedGroup,
  explicitCells, cellsInZone, captureRay, allPieces, piecesAtCell, allPlayers,
  filter, filterEmpty, union, intersection, difference,
  exists, forAll, countCompare,
  isEmpty, isOccupied, hasPiece,
  boardFull, boardEmpty, distanceMatches, groupHasLiberty, connects,
  hasLegalAction, equals, compare, not, and, or,
  seq, when, forEach,
  placePiece, removePiece, movePiece, setPieceOwner, convertPieces,
  addScore, setScore, setVar, incrementVar, advanceTurn, setNextPlayer,
  define, getDef,
} from "./ir/builders";

// Printer
export { printIRGame, printSelector, printPredicate, printEffect, printExpr } from "./ir/printer";

// Runtime
export { IRGameRuntime } from "./runtime/IRGameRuntime";

// Reference game definitions
export { ataxx } from "./games/ataxx";
export { tictactoe } from "./games/tictactoe";
export { reversi } from "./games/reversi";
