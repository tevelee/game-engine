import React, { useState, useEffect } from "react";
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
  onNewGame?: () => void;
  readonly?: boolean;
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
  onNewGame,
  readonly = false,
}: BoardProps) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  // Clear selection when state changes (move was applied)
  useEffect(() => {
    setSelectedSource(null);
  }, [state]);

  // Escape key to deselect
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedSource(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const legalActions = (outcome || readonly) ? [] : runtime.legalActions(state);
  const currentPlayerName = players[state.currentPlayer];

  // Cells that own pieces that can move
  const legalSources = new Set<string>();
  for (const action of legalActions) {
    if (action.bindings.source) legalSources.add(action.bindings.source);
  }

  // When source is selected: targets reachable from it
  const highlightedTargets = new Map<string, ActionInstance[]>();
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
  const emptyCells = Array.from(state.cells).filter((c) => c === -1).length;

  function handleCellClick(coord: string) {
    if (readonly) return;

    const idx = coordToIndex(coord, width);
    const owner = state.cells[idx];

    // Deselect if clicking the selected source again
    if (selectedSource === coord) {
      setSelectedSource(null);
      return;
    }

    // Apply action if clicking a highlighted target
    if (selectedSource && highlightedTargets.has(coord)) {
      const actions = highlightedTargets.get(coord)!;
      // prefer clone over jump when both available (clone is less aggressive)
      const action = actions.find((a) => a.id === "clone") ?? actions[0];
      onLastTrace?.(action);
      onAction(action);
      return;
    }

    // Select source if clicking a legal-source piece
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
      const isTarget = selectedSource !== null && highlightedTargets.has(coord);
      const isLegalSource = !selectedSource && legalSources.has(coord) && !readonly;

      let cls = "cell";
      if (isSource) {
        cls += " source";
      } else if (isTarget) {
        const acts = highlightedTargets.get(coord)!;
        const hasClone = acts.some((a) => a.id === "clone");
        const hasJump = acts.some((a) => a.id === "jump");
        cls += hasClone && hasJump
          ? " target-both"
          : hasClone
          ? " target-clone"
          : " target-jump";
      } else if (isLegalSource) {
        cls += " legal-source";
      }

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
          <span>
            {outcome.winner
              ? `${capitalize(outcome.winner)} wins — ${outcome.reason}`
              : `Draw — ${outcome.reason}`}
          </span>
          {onNewGame && (
            <button className="primary" onClick={onNewGame} style={{ marginLeft: 12 }}>
              New Game
            </button>
          )}
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
          <span className="turn-label">Empty: {emptyCells}</span>
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

      {passAction && !outcome && !readonly && (
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

      {!outcome && !readonly && (
        <div className="board-legend">
          {selectedSource ? (
            <span className="hint-bar">
              {selectedSource} selected — click target · <kbd>Esc</kbd> to cancel
            </span>
          ) : (
            <span className="hint-bar">
              Click one of your pieces to select it
            </span>
          )}
          <div className="legend-chips">
            <span className="legend-chip clone">Clone</span>
            <span className="legend-chip jump">Jump</span>
            <span className="legend-chip both">Clone+Jump</span>
          </div>
        </div>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
