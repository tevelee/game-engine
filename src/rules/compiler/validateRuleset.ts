import type { CompileError, GameSchema } from "../core/types";
import { isValidCoord } from "../core/coordinates";

export function validateRuleset(schema: GameSchema): CompileError[] {
  const errors: CompileError[] = [];

  if (!schema.id) errors.push({ path: "/id", message: "Missing game id." });
  if (!schema.name) errors.push({ path: "/name", message: "Missing game name." });
  if (!schema.runtime) errors.push({ path: "/runtime", message: "Missing runtime identifier." });
  if (schema.runtime && schema.runtime !== "gridOccupancy.v1")
    errors.push({ path: "/runtime", message: `Unsupported runtime "${schema.runtime}". Only "gridOccupancy.v1" is supported.` });

  if (!Array.isArray(schema.players) || schema.players.length < 2)
    errors.push({ path: "/players", message: "At least 2 players are required." });

  const { width, height } = schema.board ?? {};
  if (!width || width < 1) errors.push({ path: "/board/width", message: "Board width must be a positive integer." });
  if (!height || height < 1) errors.push({ path: "/board/height", message: "Board height must be a positive integer." });
  if (schema.board?.type !== "squareGrid")
    errors.push({ path: "/board/type", message: `Unsupported board type "${schema.board?.type}". Only "squareGrid" is supported.` });

  if (schema.turns?.type !== "alternating")
    errors.push({ path: "/turns/type", message: `Unsupported turn type "${schema.turns?.type}". Only "alternating" is supported.` });
  if (schema.turns?.first && !schema.players?.includes(schema.turns.first))
    errors.push({ path: "/turns/first", message: `First player "${schema.turns.first}" is not in the players list.` });

  for (const [i, entry] of (schema.setup ?? []).entries()) {
    if (!isValidCoord(entry.at, width, height))
      errors.push({ path: `/setup/${i}/at`, message: `Invalid coordinate: ${entry.at} is outside a ${width}×${height} board.` });
    if (!schema.pieces?.[entry.place])
      errors.push({ path: `/setup/${i}/place`, message: `Unknown piece type "${entry.place}".` });
  }

  const defNames = new Set(Object.keys(schema.definitions ?? {}));
  const moveIds = new Set((schema.moves ?? []).map((m) => m.id));

  for (const [i, move] of (schema.moves ?? []).entries()) {
    if (!move.id) errors.push({ path: `/moves/${i}/id`, message: "Move is missing an id." });

    if (move.target?.distance && !defNames.has(move.target.distance))
      errors.push({ path: `/moves/${i}/target/distance`, message: `Unknown definition "${move.target.distance}". Define it under "definitions".` });

    for (const [j, effect] of (move.effects ?? []).entries()) {
      if (effect.type === "convertEnemyPiecesAtDistance" && !defNames.has(effect.distance))
        errors.push({ path: `/moves/${i}/effects/${j}/distance`, message: `Unknown definition "${effect.distance}". Define it under "definitions".` });
    }

    if (move.allowedWhen?.moves) {
      for (const ref of move.allowedWhen.moves) {
        if (!moveIds.has(ref))
          errors.push({ path: `/moves/${i}/allowedWhen/moves`, message: `Unknown move reference "${ref}".` });
      }
    }
  }

  for (const [i, cond] of (schema.end ?? []).entries()) {
    if (cond.type === "allPlayersHaveNoLegalMoves" && cond.moves) {
      for (const ref of cond.moves) {
        if (!moveIds.has(ref))
          errors.push({ path: `/end/${i}/moves`, message: `Unknown move reference "${ref}".` });
      }
    }
  }

  return errors;
}
