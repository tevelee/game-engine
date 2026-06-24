import { useState, useEffect } from "react";
import type { GameEvent, GameRuntime, GridState, CompiledPlan } from "../../rules/core/types";
import { Board } from "../../ui/Board";

interface Props {
  runtime: GameRuntime | null;
  plan: CompiledPlan | null;
  events: GameEvent[];
}

export function ReplayTab({ runtime, plan, events }: Props) {
  const [cursor, setCursor] = useState(events.length);
  const [following, setFollowing] = useState(true); // auto-advance to latest

  // When following mode is on, stay pinned to the latest move
  useEffect(() => {
    if (following) setCursor(events.length);
  }, [events.length, following]);

  const safeCursor = Math.min(cursor, events.length);

  if (!runtime || !plan) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>
          Compile a valid schema and play moves to use replay.
        </div>
      </div>
    );
  }

  const replayResult = runtime.replay(events.slice(0, safeCursor));
  const replayState: GridState =
    replayResult.states[safeCursor] ??
    replayResult.states[replayResult.states.length - 1];
  const replayOutcome = safeCursor === events.length ? replayResult.outcome : null;

  function go(next: number) {
    const clamped = Math.max(0, Math.min(events.length, next));
    setCursor(clamped);
    setFollowing(clamped === events.length);
  }

  const currentEvent = safeCursor > 0 ? events[safeCursor - 1] : null;

  return (
    <div
      className="scroll-area"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
    >
      <div className="replay-controls">
        <button onClick={() => go(0)} disabled={safeCursor === 0}>
          ⏮ Start
        </button>
        <button onClick={() => go(safeCursor - 1)} disabled={safeCursor === 0}>
          ◀ Prev
        </button>
        <span className="replay-pos">
          Move {safeCursor} / {events.length}
        </span>
        <button
          onClick={() => go(safeCursor + 1)}
          disabled={safeCursor === events.length}
        >
          Next ▶
        </button>
        <button
          onClick={() => go(events.length)}
          disabled={safeCursor === events.length}
        >
          Latest ⏭
        </button>
        <label className="replay-follow" title="Auto-advance when new moves are played">
          <input
            type="checkbox"
            checked={following}
            onChange={(e) => {
              setFollowing(e.target.checked);
              if (e.target.checked) setCursor(events.length);
            }}
          />
          Follow live
        </label>
      </div>

      {currentEvent && (
        <div className="info-row" style={{ justifyContent: "center" }}>
          <div className="info-chip">
            Move: <span>{currentEvent.action.id}</span>
          </div>
          <div className="info-chip">
            Actor: <span>{currentEvent.actor}</span>
          </div>
          {Object.entries(currentEvent.action.bindings).map(([k, v]) => (
            <div key={k} className="info-chip">
              {k}: <span>{v}</span>
            </div>
          ))}
        </div>
      )}

      <Board
        state={replayState}
        runtime={runtime}
        players={plan.players}
        width={plan.grid.width}
        height={plan.grid.height}
        outcome={replayOutcome}
        onAction={() => {}}
        readonly
      />
    </div>
  );
}
