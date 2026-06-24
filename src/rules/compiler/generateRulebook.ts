import type { GameSchema } from "../core/types";

function humanDistance(defName: string, schema: GameSchema): string {
  const def = schema.definitions[defName];
  if (!def) return defName;
  const metricLabel = def.metric === "king" ? "including diagonals" : def.metric;
  return `exactly ${def.distance} square${def.distance > 1 ? "s" : ""} away (${metricLabel})`;
}

function ownerLabel(owner: string): string {
  if (owner === "currentPlayer") return "your";
  if (owner === "empty") return "empty";
  return owner + "'s";
}

function effectSentence(effect: Record<string, unknown>, schema: GameSchema): string {
  switch (effect.type) {
    case "placePiece":
      return `Place a new ${effect.piece} at the target.`;
    case "setCellOwner":
      if (effect.owner === "empty") return `Remove your ${effect.piece ?? "piece"} from the source.`;
      return `Move your piece to the target.`;
    case "convertEnemyPiecesAtDistance": {
      const dist = effect.distance as string;
      return `Convert adjacent enemy pieces within ${humanDistance(dist, schema)} of the target to your color.`;
    }
    case "advanceTurn":
      return `Your turn ends.`;
    default:
      return String(effect.type);
  }
}

export function generateRulebook(schema: GameSchema): string {
  const lines: string[] = [];
  const { width, height } = schema.board;
  const [p0, p1] = schema.players.map((p) => capitalize(p));

  lines.push(`# ${schema.name}`);
  lines.push("");
  lines.push(
    `${schema.name} is played by ${p0} and ${p1} on a ${width}×${height} square grid.`
  );

  const blackSetup = schema.setup
    .filter((e) => e.owner === schema.players[0])
    .map((e) => e.at)
    .join(" and ");
  const whiteSetup = schema.setup
    .filter((e) => e.owner === schema.players[1])
    .map((e) => e.at)
    .join(" and ");
  if (blackSetup) lines.push(`${p0} starts with stones on ${blackSetup}.`);
  if (whiteSetup) lines.push(`${p1} starts with stones on ${whiteSetup}.`);

  const first = capitalize(schema.turns.first);
  lines.push(`${first} moves first.`);
  lines.push("");

  for (const move of schema.moves) {
    lines.push(`## ${move.label}`);
    if (move.allowedWhen) {
      const aw = move.allowedWhen;
      if (aw.type === "noLegalMoves" && aw.moves) {
        const refs = aw.moves.map((id) => {
          const m = schema.moves.find((m) => m.id === id);
          return m ? m.label : id;
        });
        lines.push(`If you have no legal ${refs.join(" or ")}, you must pass.`);
      }
    } else {
      const parts: string[] = [];
      if (move.source) {
        parts.push(`Choose one of ${ownerLabel(move.source.owner)} ${move.source.piece}s.`);
      }
      if (move.target) {
        const dist = humanDistance(move.target.distance, schema);
        parts.push(`Target an empty cell ${dist}.`);
      }
      const effectLines = (move.effects ?? [])
        .filter((e) => e.type !== "advanceTurn")
        .map((e) => effectSentence(e as Record<string, unknown>, schema));
      parts.push(...effectLines);
      lines.push(parts.join(" "));
    }
    lines.push("");
  }

  lines.push("## End Conditions");
  const endDescs = schema.end.map((c) => {
    switch (c.type) {
      case "boardFull":
        return "the board is full";
      case "anyPlayerPieceCountEquals":
        return `a player has ${c.count} ${c.piece ?? "piece"}s`;
      case "allPlayersHaveNoLegalMoves": {
        const refs = (c.moves ?? []).map((id) => {
          const m = schema.moves.find((m) => m.id === id);
          return m ? m.label : id;
        });
        return `neither player can make a ${refs.join(" or ")} move`;
      }
      default:
        return c.type;
    }
  });
  lines.push(`The game ends when ${endDescs.join(", or ")}.`);
  lines.push("");

  lines.push("## Winner");
  const result = schema.result;
  if (result.type === "maxPieceCount") {
    lines.push(
      `The player with the most ${result.piece ?? "pieces"} wins.${result.tie === "draw" ? " If tied, the game is a draw." : ""}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
