/**
 * IR Printer — converts an IRGame into a human-readable string.
 *
 * The output is the "expanded form" visible in the playground's IR tab.
 * It shows the fully-resolved game logic with:
 *   - Named definitions and their explain strings
 *   - Fully inlined selectors, predicates, and effects
 *   - Source annotations in [brackets]
 *   - Indented tree structure
 *
 * Output style (simplified for readability):
 *
 *   Action: clone
 *     Actor: currentPlayer
 *     Binding source [choose one of your own stones]
 *       = filter allCells(main) as cell where
 *           exists piecesAt(cell, owner=currentPlayer, type=stone)
 *     Binding target [choose an empty adjacent cell]
 *       = filter allCells(main) as cell where
 *           isEmpty(cell) AND distanceIs(source, cell, king, exactly, 1)
 *     Effects:
 *       placePiece(stone, currentPlayer, target)
 *       forEach filter ... as enemyCell:
 *         setPieceOwner(enemyCell, currentPlayer)
 *       advanceTurn()
 */

import type {
  IRGame, IRAction, IRBinding,
  IRSelector, IRPredicate, IREffect,
  IRExpr, IREndCondition, IRResultRule, IRVar,
} from "./types";

// ─── Public entry point ───────────────────────────────────────────────────────

/** Render the complete IR of a game to a multi-line string. */
export function printIRGame(game: IRGame): string {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w(`Game: ${game.name}  (${game.id} v${game.version})`);
  if (game.description) w(`  ${game.description}`);
  w(`  Modules: ${game.modules.join(", ")}`);
  w(`  Board:   ${game.board.id} ${game.board.width}×${game.board.height} (${game.board.coordinates})`);
  w(`  Players: ${game.players.join(", ")}`);
  w(`  Pieces:  ${game.pieceTypes.map(p => p.id).join(", ")}`);
  if (game.vars.length > 0) {
    w(`  Vars:`);
    for (const v of game.vars) printVar(v, lines, 4);
  }
  w(``);

  if (game.definitions.length > 0) {
    w(`── Definitions ──────────────────────────────────────────────────────────`);
    for (const def of game.definitions) {
      const explain = def.explain ? `  [${def.explain}]` : "";
      w(`  ${def.name}${explain}`);
      if (isSelector(def.value))  w(`    = ${printSelector(def.value, 6)}`);
      if (isPredicate(def.value)) w(`    = ${printPredicate(def.value, 6)}`);
      if (isEffect(def.value))    w(`    → ${printEffect(def.value, 6)}`);
      w(``);
    }
  }

  w(`── Setup ────────────────────────────────────────────────────────────────`);
  for (const eff of game.setup) {
    w(`  ${printEffect(eff, 2)}`);
  }
  w(``);

  w(`── Actions ──────────────────────────────────────────────────────────────`);
  for (const action of game.actions) {
    printAction(action, lines);
    w(``);
  }

  w(`── End conditions ───────────────────────────────────────────────────────`);
  for (const ec of game.endConditions) {
    printEndCondition(ec, lines);
  }
  w(``);

  w(`── Result rule ──────────────────────────────────────────────────────────`);
  w(`  ${printResult(game.result)}`);

  return lines.join("\n");
}

// ─── IR section printers ──────────────────────────────────────────────────────

function printVar(v: IRVar, lines: string[], indent: number): void {
  const pad = " ".repeat(indent);
  const explain = v.explain ? ` — ${v.explain}` : "";
  lines.push(`${pad}${v.name}: ${v.type} = ${String(v.initial)}${explain}`);
}

function printAction(action: IRAction, lines: string[]): void {
  const explain = action.explain ? `  [${action.explain}]` : "";
  lines.push(`  Action: ${action.id} — ${action.label}${explain}`);
  lines.push(`    Actor: ${printExpr(action.actor)}`);

  if (action.allowedWhen) {
    lines.push(`    Allowed when: ${printPredicate(action.allowedWhen, 18)}`);
  }
  if (action.condition) {
    lines.push(`    Condition: ${printPredicate(action.condition, 16)}`);
  }

  for (const b of action.bindings) {
    printBinding(b, lines);
  }

  lines.push(`    Effects:`);
  const effects = action.effects.kind === "sequence"
    ? action.effects.effects
    : [action.effects];
  for (const eff of effects) {
    lines.push(`      ${printEffect(eff, 6)}`);
  }
}

function printBinding(b: IRBinding, lines: string[]): void {
  const explain = b.explain ? `  [${b.explain}]` : "";
  lines.push(`    Binding ${b.name}${explain}`);
  lines.push(`      from: ${printSelector(b.from, 12)}`);
}

function printEndCondition(ec: IREndCondition, lines: string[]): void {
  const explain = ec.explain ? `  [${ec.explain}]` : "";
  lines.push(`  ${ec.id}${explain}`);
  lines.push(`    when: ${printPredicate(ec.when, 10)}`);
}

function printResult(r: IRResultRule): string {
  switch (r.kind) {
    case "maxPieceCount":
      return `maxPieceCount(${r.pieceType}, board=${r.board}, tie=${r.tie})`;
    case "maxScore":
      return `maxScore(tie=${r.tie})`;
    case "minScore":
      return `minScore(tie=${r.tie})`;
    case "lastMoverLoses":
      return `lastMoverLoses`;
    case "firstMatch":
      return `firstMatch(\n${r.cases.map(c => `    ${printPredicate(c.condition, 4)} → ${printExpr(c.winner)}`).join("\n")}\n  )`;
  }
}

// ─── Node printers ────────────────────────────────────────────────────────────

export function printExpr(expr: IRExpr): string {
  switch (expr.kind) {
    case "lit":    return expr.value === null ? "null" : String(expr.value);
    case "var":    return expr.name;
    case "global": return expr.name;
    case "field":  return `${printExpr(expr.of)}.${expr.field}`;
  }
}

export function printSelector(sel: IRSelector, _indent = 0): string {
  const src = sel.src?.definition ? `{${sel.src.definition}}` : "";
  switch (sel.kind) {
    case "allCells":        return `allCells(${sel.board})${src}`;
    case "emptyCells":      return `emptyCells(${sel.board})${src}`;
    case "explicitCells":   return `[${sel.coords.join(", ")}]${src}`;
    case "cellsInZone":     return `zone(${sel.zone})${src}`;
    case "allPlayers":      return `allPlayers()${src}`;

    case "cellsAtDistance":
      return `cellsAt(${sel.board}, from=${printExpr(sel.from)}, ${sel.metric} ${sel.mode} ${sel.value})${src}`;

    case "rookRayCells":
      return `rookRay(${sel.board}, from=${printExpr(sel.from)}${sel.blockedBy ? `, blockedBy=${sel.blockedBy}` : ""})${src}`;

    case "bishopRayCells":
      return `bishopRay(${sel.board}, from=${printExpr(sel.from)}${sel.blockedBy ? `, blockedBy=${sel.blockedBy}` : ""})${src}`;

    case "rayCells":
      return `ray(${sel.board}, from=${printExpr(sel.from)}, d=(${sel.dx},${sel.dy})${sel.maxSteps != null ? `, max=${sel.maxSteps}` : ""})${src}`;

    case "connectedGroup":
      return `group(${sel.board}, from=${printExpr(sel.from)}${sel.pieceType ? `, type=${sel.pieceType}` : ""}${sel.owner ? `, owner=${printExpr(sel.owner)}` : ""})${src}`;

    case "allPieces":
      return `allPieces(${sel.board}${sel.pieceType ? `, type=${sel.pieceType}` : ""}${sel.owner ? `, owner=${printExpr(sel.owner)}` : ""})${src}`;

    case "piecesAtCell":
      return `piecesAt(${printExpr(sel.cell)}${sel.pieceType ? `, type=${sel.pieceType}` : ""}${sel.owner ? `, owner=${printExpr(sel.owner)}` : ""})${src}`;

    case "filter": {
      const explain = sel.src?.explain ? ` — "${sel.src.explain}"` : "";
      return `filter(${printSelector(sel.from)}) as ${sel.binding} where ${printPredicate(sel.where)}${explain}${src}`;
    }

    case "union":
      return `union(${sel.of.map(s => printSelector(s)).join(", ")})${src}`;

    case "intersection":
      return `intersection(${sel.of.map(s => printSelector(s)).join(", ")})${src}`;

    case "difference":
      return `diff(${printSelector(sel.from)} − ${printSelector(sel.exclude)})${src}`;
  }
}

export function printPredicate(pred: IRPredicate, _indent = 0): string {
  const src = pred.src?.definition ? `{${pred.src.definition}}` : "";
  switch (pred.kind) {
    case "true":   return `true`;
    case "false":  return `false`;

    case "exists":
      return `exists(${printSelector(pred.in)})${src}`;

    case "forAll":
      return `forAll(${printSelector(pred.in)}) as ${pred.binding}: ${printPredicate(pred.where)}${src}`;

    case "countCompare":
      return `count(${printSelector(pred.of)}) ${pred.op} ${printExpr(pred.value)}${src}`;

    case "equals":
      return `${printExpr(pred.left)} == ${printExpr(pred.right)}${src}`;

    case "compare":
      return `${printExpr(pred.left)} ${pred.op} ${printExpr(pred.right)}${src}`;

    case "isEmpty":
      return `isEmpty(${printExpr(pred.cell)})${src}`;

    case "isOccupied":
      return `isOccupied(${printExpr(pred.cell)})${src}`;

    case "hasPiece":
      return `hasPiece(${printExpr(pred.cell)}${pred.pieceType ? `, type=${pred.pieceType}` : ""}${pred.owner ? `, owner=${printExpr(pred.owner)}` : ""})${src}`;

    case "boardFull":
      return `boardFull(${pred.board})${src}`;

    case "boardEmpty":
      return `boardEmpty(${pred.board})${src}`;

    case "distanceMatches":
      return `distance(${printExpr(pred.from)}, ${printExpr(pred.to)}, ${pred.metric}) ${pred.mode} ${pred.value}${src}`;

    case "groupHasLiberty":
      return `groupHasLiberty(${printExpr(pred.cell)}, ${pred.board}${pred.pieceType ? `, type=${pred.pieceType}` : ""})${src}`;

    case "connects":
      return `connects(${pred.board}, ${printExpr(pred.owner)}, ${pred.fromZone}→${pred.toZone})${src}`;

    case "hasLegalAction":
      return `hasLegalAction(${printExpr(pred.player)}, [${pred.actions.join(", ")}])${src}`;

    case "not":
      return `NOT ${printPredicate(pred.of)}${src}`;

    case "and":
      return pred.of.map(p => printPredicate(p)).join(" AND ") + src;

    case "or":
      return `(${pred.of.map(p => printPredicate(p)).join(" OR ")})${src}`;
  }
}

export function printEffect(eff: IREffect, _indent = 0): string {
  const src = eff.src?.definition ? `{${eff.src.definition}}` : "";
  switch (eff.kind) {
    case "sequence":
      return eff.effects.map(e => printEffect(e)).join("\n      ");

    case "if":
      return `if ${printPredicate(eff.condition)} then ${printEffect(eff.then)}${eff.else ? ` else ${printEffect(eff.else)}` : ""}${src}`;

    case "forEach": {
      const explain = eff.src?.explain ? ` — "${eff.src.explain}"` : "";
      const defTag  = eff.src?.definition ? `{${eff.src.definition}} ` : "";
      return `${defTag}forEach ${printSelector(eff.in)} as ${eff.binding}${explain}:\n        ${printEffect(eff.do)}`;
    }

    case "placePiece":
      return `placePiece(${eff.pieceType}, owner=${printExpr(eff.owner)}, at=${printExpr(eff.at)})${src}`;

    case "removePiece":
      return `removePiece(${printExpr(eff.at)})${src}`;

    case "movePiece":
      return `movePiece(${printExpr(eff.from)} → ${printExpr(eff.to)})${src}`;

    case "setPieceOwner":
      return `setPieceOwner(${printExpr(eff.at)}, ${printExpr(eff.owner)})${src}`;

    case "convertPieces":
      return `convertPieces(${printSelector(eff.in)}, to=${printExpr(eff.toOwner)})${src}`;

    case "addScore":
      return `addScore(${printExpr(eff.player)}, ${printExpr(eff.amount)})${src}`;

    case "setScore":
      return `setScore(${printExpr(eff.player)}, ${printExpr(eff.amount)})${src}`;

    case "setVar":
      return `setVar(${eff.name}, ${eff.value === null ? "null" : printExpr(eff.value)})${src}`;

    case "incrementVar":
      return `incrementVar(${eff.name}${eff.by != null && eff.by !== 1 ? `, by=${eff.by}` : ""})${src}`;

    case "advanceTurn":
      return `advanceTurn()${src}`;

    case "setNextPlayer":
      return `setNextPlayer(${printExpr(eff.player)})${src}`;
  }
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isSelector(node: IRSelector | IRPredicate | IREffect): node is IRSelector {
  return typeof (node as IRSelector).irType === "object";
}

function isPredicate(node: IRSelector | IRPredicate | IREffect): node is IRPredicate {
  return (node as IRPredicate).irType === "bool";
}

function isEffect(node: IRSelector | IRPredicate | IREffect): node is IREffect {
  return (node as IREffect).irType === "effect";
}

