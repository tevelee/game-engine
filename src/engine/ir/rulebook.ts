/**
 * Generate a human-readable rulebook from an IRGame.
 *
 * Produces the Markdown document described in the plan (section 9.5).
 * Text comes from:
 *   game.name / description    — header and intro
 *   game.setup                 — starting positions (from placePiece literals)
 *   action.explain             — one-line action summary
 *   binding.explain            — how to choose each binding
 *   effect src.explain         — what each effect does (advanceTurn excluded)
 *   endCondition.explain       — when the game ends
 *   result                     — who wins
 */

import type { IRGame, IREffect, IRAction, IRPredicate } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Recursively collect non-advanceTurn effect explains from a (possibly nested) effect. */
function effectExplains(eff: IREffect): string[] {
  if (eff.kind === "sequence") {
    return eff.effects.flatMap(effectExplains);
  }
  if (eff.kind === "forEach" || eff.kind === "if") {
    // Use this node's explain if present (e.g. the named definition wrapping a forEach)
    if (eff.src?.explain) return [cap(eff.src.explain) + "."];
    // Otherwise recurse into the body
    const body = eff.kind === "forEach" ? eff.do : [eff.then, eff.else].filter(Boolean) as IREffect[];
    return (Array.isArray(body) ? body : [body]).flatMap(effectExplains);
  }
  if (eff.kind === "advanceTurn" || eff.kind === "setNextPlayer") return [];
  if (eff.src?.explain) return [cap(eff.src.explain) + "."];
  return [];
}

/** Render the allowedWhen guard as prose. */
function renderAllowedWhen(pred: IRPredicate, actions: IRAction[]): string {
  const actionLabel = (id: string) => actions.find((a) => a.id === id)?.label ?? id;

  if (pred.kind === "not") {
    const inner = pred.of;
    if (inner.kind === "hasLegalAction") {
      const labels = inner.actions.map(actionLabel);
      const list = labels.length === 1
        ? labels[0]
        : labels.slice(0, -1).join(", ") + " or " + labels[labels.length - 1];
      return `If you have no legal ${list} move, you pass.`;
    }
  }
  return pred.src?.explain ? cap(pred.src.explain) + "." : "This action is conditionally available.";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateRulebook(game: IRGame): string {
  const lines: string[] = [];
  const [p0, p1] = game.players.map(cap);
  const piece = game.pieceTypes[0]?.id ?? "piece";

  // ── Title ──────────────────────────────────────────────────────────────────
  lines.push(`# ${game.name}`);

  if (game.description) {
    lines.push("");
    lines.push(game.description);
  }

  lines.push("");
  lines.push(
    `${game.name} is a two-player game played by ${p0} and ${p1} ` +
    `on a ${game.board.width}×${game.board.height} square grid.`,
  );

  // ── Starting position ──────────────────────────────────────────────────────
  for (const player of game.players) {
    const cells: string[] = [];
    for (const eff of game.setup) {
      if (
        eff.kind === "placePiece" &&
        eff.owner.kind === "lit" && eff.owner.value === player &&
        eff.at.kind === "lit" && typeof eff.at.value === "string"
      ) {
        cells.push(eff.at.value);
      }
    }
    if (cells.length > 0) {
      const coord = cells.length === 1
        ? cells[0]
        : cells.slice(0, -1).join(", ") + " and " + cells[cells.length - 1];
      lines.push(`${cap(player)} starts with ${piece}s on ${coord}.`);
    }
  }

  lines.push(`${cap(game.players[0])} moves first. Players alternate turns.`);

  // ── Goal ───────────────────────────────────────────────────────────────────
  lines.push("");
  lines.push("## Goal");
  lines.push(renderResult(game, piece));

  // ── Actions ────────────────────────────────────────────────────────────────
  for (const action of game.actions) {
    lines.push("");
    lines.push(`## ${action.label}`);

    if (action.allowedWhen) {
      lines.push(renderAllowedWhen(action.allowedWhen, game.actions));
    } else {
      // Binding selection steps
      for (const binding of action.bindings) {
        if (binding.explain) lines.push(cap(binding.explain) + ".");
      }
      // Effect consequence steps (skip advanceTurn)
      const effs = effectExplains(action.effects);
      for (const line of effs) lines.push(line);
      // Fallback: use the action's own explain string if nothing else produced output
      if (effs.length === 0 && action.bindings.every((b) => !b.explain) && action.explain) {
        lines.push(action.explain);
      }
    }
  }

  // ── End conditions ─────────────────────────────────────────────────────────
  lines.push("");
  lines.push("## End of the game");
  lines.push("The game ends when any of these conditions is true:");
  for (const cond of game.endConditions) {
    lines.push(`- ${cond.explain ?? cond.id}`);
  }

  // ── Winner ─────────────────────────────────────────────────────────────────
  lines.push("");
  lines.push("## Winner");
  lines.push(renderResult(game, piece));

  return lines.join("\n");
}

function renderResult(game: IRGame, piece: string): string {
  const r = game.result;
  if (r.kind === "maxPieceCount") {
    const tie = r.tie === "draw" ? " If both players have the same number, the game is a draw." : "";
    return `The player with the most ${r.pieceType}s wins.${tie}`;
  }
  if (r.kind === "firstMatch") {
    const winCase = r.cases.find((c) => c.explain);
    if (winCase?.explain) {
      const draw = r.else === "draw" ? " Otherwise the game is a draw." : "";
      return cap(winCase.explain) + "." + draw;
    }
  }
  if (r.kind === "maxScore") return "The player with the highest score wins.";
  if (r.kind === "minScore") return "The player with the lowest score wins.";
  if (r.kind === "lastMoverLoses") return "The player who made the last move loses.";
  return `The winner is determined by ${piece} count.`;
}
