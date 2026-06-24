import React, { useState } from "react";
import type { GridState, ActionInstance, GameRuntime, Outcome } from "../rules/core/types";
import { indexToCoord, coordToIndex } from "../rules/core/coordinates";

interface BoardProps {
  state: GridState;
  runtime: GameRuntime;
  players: string[];
  width: number;
  height: number;
  outcome: Outcome | null;
  onAction: (action: ActionInstance) => void;
  onLastTrace?: (action: ActionInstance) => void;
}

export function Board({
  state,
  runtime,
  players,
  width,
  height,
  outcome,
  onAction,
  onLastTrace,
}: BoardProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const legalActions = outcome ? [] : runtime.legalActions(state);
  const currentPlayerName = players[state.currentPlayer];

  const legalSources = new Set<string>();
  const legalTargets = new Map<string, ActionInstance[]>();

  for (const action of legalActions) {
    if (action.bindings.source) legalSources.add(action.bindings.source);
    if (action.bindings.target) {
      const t = action.bindings.target;
      if (!legalTargets.has(t)) legalTargets.set(t, []);
      if (!action.bindings.source || action.bindings.source === selectedSource) {
        legalTargets.get(t)!.push(action);
      }
    }
  }

  const highlightedTargets = selectedSource
    ? new Map<string, ActionInstance[]>()
    : legalTargets;

  if (selectedSource) {
    for (const action of legalActions) {
      if (action.bindings.source === selectedSource && action.bindings.target) {
        const t = action.bindings.target;
        if (!highlightedTargets.has(t)) highlightedTargets.set(t, []);
        highlightedTargets.get(t)!.push(action);
      }
    }
  }

  const passAction = legalActions.find((a) => a.id === "pass");

  const counts = players.map(
    (_, pi) => Array.from(state.cells).filter((c) => c === pi).length
  );

  function handleCellClick(coord: string) {
    const idx = coordToIndex(coord, width);
    const owner = state.cells[idx];

    if (selectedSource === coord) {
      setSelectedSource(null);
      return;
    }

    if (highlightedTargets.has(coord)) {
      const actions = highlightedTargets.get(coord)!;
      const action = actions[0];
      onLastTrace?.(action);
      onAction(action);
      setSelectedSource(null);
      return;
    }

    if (owner === state.currentPlayer && legalSources.has(coord)) {
      setSelectedSource(coord);
      return;
    }

    setSelectedSource(null);
  }

  const cells: React.ReactElement[] = [];

  for (let r = height - 1; r >= 0; r--) {
    for (let f = 0; f < width; f++) {
      const idx = r * width + f;
      const coord = indexToCoord(idx, width);
      const owner = state.cells[idx];
      const isSource = coord === selectedSource;
      const isTarget = highlightedTargets.has(coord);
      const isLegalSource = legalSources.has(coord) && !selectedSource;

      let cls = "cell";
      if (isSource) cls += " source";
      else if (isTarget) {
        const acts = highlightedTargets.get(coord)!;
        const hasClone = acts.some((a) => a.id === "clone");
        const hasJump = acts.some((a) => a.id === "jump");
        cls += hasClone && hasJump ? " target-both" : hasClone ? " target-clone" : " target-jump";
      } else if (isLegalSource) cls += " legal-source";

      const isDark = (f + r) % 2 === 0;
      cls += isDark ? " dark" : " light";

      const pieceClass =
        owner === 0 ? "piece black" : owner === 1 ? "piece white" : "";

      cells.push(
        <div
          key={coord}
          className={cls}
          onClick={() => handleCellClick(coord)}
          title={coord}
        >
          {owner !== -1 && <div className={pieceClass} />}
          {isTarget && owner === -1 && <div className="target-dot" />}
          <span className="coord-label">{coord}</span>
        </div>
      );
    }
  }

  return (
    <div className="board-wrapper">
      {outcome ? (
        <div className="outcome-banner">
          {outcome.winner
            ? `${capitalize(outcome.winner)} wins! ${outcome.reason}`
            : `Draw. ${outcome.reason}`}
        </div>
      ) : (
        <div className="status-bar">
          <span className={`player-dot ${currentPlayerName}`} />
          <strong>{capitalize(currentPlayerName)}'s turn</strong>
          <span className="sep">|</span>
          {players.map((p, i) => (
            <span key={p} className="score-chip">
              <span className={`player-dot ${p}`} />
              {capitalize(p)}: {counts[i]}
            </span>
          ))}
          <span className="sep">|</span>
          <span className="turn-label">Turn {state.turnNumber}</span>
        </div>
      )}

      <div
        className="board-grid"
        style={{
          gridTemplateColumns: `repeat(${width}, 1fr)`,
          gridTemplateRows: `repeat(${height}, 1fr)`,
        }}
      >
        {cells}
      </div>

      {passAction && !outcome && (
        <div className="pass-row">
          <button
            className="primary"
            onClick={() => {
              onLastTrace?.(passAction);
              onAction(passAction);
            }}
          >
            Pass (no legal moves)
          </button>
        </div>
      )}

      {selectedSource && (
        <div className="hint-bar">
          Selected {selectedSource} — click a highlighted target to move, or click source again to deselect.
        </div>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
