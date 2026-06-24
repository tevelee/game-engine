import type {
  GameSchema,
  CompiledPlan,
  CompiledAction,
  BindingSpec,
  EffectSpec,
  CompileResult,
} from "../core/types";
import { validateRuleset } from "./validateRuleset";
import { generateRulebook } from "./generateRulebook";

export function compileRuleset(schema: GameSchema): CompileResult {
  const errors = validateRuleset(schema);
  if (errors.length > 0) {
    return { success: false, errors, plan: null, rulebook: null };
  }

  const actions: CompiledAction[] = [];

  for (const move of schema.moves) {
    const bindings: BindingSpec[] = [];
    const effects: EffectSpec[] = [];

    if (move.source) {
      bindings.push(["ownedCells", "$currentPlayer"]);
    }
    if (move.target) {
      bindings.push(["emptyCellsInRelation", move.target.distance, "$source"]);
    }

    for (const effect of move.effects) {
      switch (effect.type) {
        case "placePiece":
          effects.push(["setCellOwner", "$target", "$currentPlayer"]);
          break;
        case "setCellOwner":
          if (effect.owner === "empty") {
            effects.push(["clearCell", `$${effect.cell}`]);
          } else {
            effects.push(["setCellOwner", `$${effect.cell}`, `$${effect.owner}`]);
          }
          break;
        case "convertEnemyPiecesAtDistance":
          effects.push([
            "convertCellsInRelation",
            effect.distance,
            `$${effect.from}`,
            "$opponent",
            "$currentPlayer",
          ]);
          break;
        case "advanceTurn":
          effects.push(["advanceTurn"]);
          break;
      }
    }

    const action: CompiledAction = {
      id: move.id,
      label: move.label,
      bindings,
      effects,
    };

    if (move.allowedWhen) {
      if (move.allowedWhen.type === "noLegalMoves") {
        action.allowedWhen = {
          type: "noLegalMoves",
          actions: move.allowedWhen.moves ?? [],
          player: move.allowedWhen.player ?? "currentPlayer",
        };
      }
    }

    actions.push(action);
  }

  const plan: CompiledPlan = {
    runtime: schema.runtime,
    grid: { width: schema.board.width, height: schema.board.height },
    players: schema.players,
    relations: schema.definitions,
    actions,
    setup: schema.setup,
    end: schema.end,
    result: schema.result,
  };

  const rulebook = generateRulebook(schema);

  return { success: true, errors: [], plan, rulebook };
}
