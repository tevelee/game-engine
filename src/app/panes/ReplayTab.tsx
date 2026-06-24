import type { GameEvent, GameRuntime, GridState, CompiledPlan } from "../../rules/core/types";
import { Board } from "../../ui/Board";

interface Props {
  runtime: GameRuntime | null;
  plan: CompiledPlan | null;
  events: GameEvent[];
}

export function ReplayTab({ runtime, plan, events }: Props) {
  const [cursor, setCursor] = useState(events.length);

  // Keep cursor in bounds when events change
  const safeCursor = Math.min(cursor, events.length);

  if (!runtime || !plan) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Compile a valid schema and play moves to use replay.</div>
      </div>
    );
  }

  const replayResult = runtime.replay(events.slice(0, safeCursor));
  const replayState: GridState = replayResult.states[safeCursor] ?? replayResult.states[replayResult.states.length - 1];
  const replayOutcome = safeCursor === events.length ? replayResult.outcome : null;

  return (
    <div className="scroll-area" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div className="replay-controls">
        <button onClick={() => setCursor(0)} disabled={safeCursor === 0}>⏮ Start</button>
        <button onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={safeCursor === 0}>◀ Prev</button>
        <span className="replay-pos">
          Move {safeCursor} / {events.length}
        </span>
        <button onClick={() => setCursor((c) => Math.min(events.length, c + 1))} disabled={safeCursor === events.length}>Next ▶</button>
        <button onClick={() => setCursor(events.length)} disabled={safeCursor === events.length}>Latest ⏭</button>
      </div>

      {safeCursor > 0 && events[safeCursor - 1] && (
        <div className="info-row" style={{ justifyContent: "center" }}>
          <div className="info-chip">Last move: <span>{events[safeCursor - 1].action.id}</span></div>
          <div className="info-chip">Actor: <span>{events[safeCursor - 1].actor}</span></div>
          {Object.entries(events[safeCursor - 1].action.bindings).map(([k, v]) => (
            <div key={k} className="info-chip">{k}: <span>{v}</span></div>
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
      />
    </div>
  );
}

import { useState } from "react";
