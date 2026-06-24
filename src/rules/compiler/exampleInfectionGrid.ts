import type { GameSchema } from "../core/types";

export const exampleInfectionGrid: GameSchema = {
  id: "infection-grid",
  name: "Infection Grid",
  runtime: "gridOccupancy.v1",
  players: ["black", "white"],
  board: {
    type: "squareGrid",
    width: 7,
    height: 7,
    coordinates: "algebraic",
  },
  turns: {
    type: "alternating",
    first: "black",
  },
  pieces: {
    stone: {
      ownership: "player",
      location: "cell",
      stacking: "single",
    },
  },
  setup: [
    { place: "stone", owner: "black", at: "a1" },
    { place: "stone", owner: "black", at: "g7" },
    { place: "stone", owner: "white", at: "g1" },
    { place: "stone", owner: "white", at: "a7" },
  ],
  definitions: {
    cloneDistance: { metric: "king", distance: 1 },
    jumpDistance: { metric: "king", distance: 2 },
    conversionDistance: { metric: "king", distance: 1 },
  },
  moves: [
    {
      id: "clone",
      label: "Clone",
      source: { type: "ownedCell", piece: "stone", owner: "currentPlayer" },
      target: { type: "emptyCellAtDistance", from: "source", distance: "cloneDistance" },
      effects: [
        { type: "placePiece", piece: "stone", owner: "currentPlayer", at: "target" },
        { type: "convertEnemyPiecesAtDistance", from: "target", distance: "conversionDistance", toOwner: "currentPlayer" },
        { type: "advanceTurn" },
      ],
    },
    {
      id: "jump",
      label: "Jump",
      source: { type: "ownedCell", piece: "stone", owner: "currentPlayer" },
      target: { type: "emptyCellAtDistance", from: "source", distance: "jumpDistance" },
      effects: [
        { type: "setCellOwner", cell: "source", owner: "empty" },
        { type: "setCellOwner", cell: "target", owner: "currentPlayer" },
        { type: "convertEnemyPiecesAtDistance", from: "target", distance: "conversionDistance", toOwner: "currentPlayer" },
        { type: "advanceTurn" },
      ],
    },
    {
      id: "pass",
      label: "Pass",
      allowedWhen: {
        type: "noLegalMoves",
        moves: ["clone", "jump"],
        player: "currentPlayer",
      },
      effects: [{ type: "advanceTurn" }],
    },
  ],
  end: [
    { type: "boardFull" },
    { type: "anyPlayerPieceCountEquals", piece: "stone", count: 0 },
    { type: "allPlayersHaveNoLegalMoves", moves: ["clone", "jump"] },
  ],
  result: {
    type: "maxPieceCount",
    piece: "stone",
    tie: "draw",
  },
};

export const exampleInfectionGridJson = JSON.stringify(exampleInfectionGrid, null, 2);
