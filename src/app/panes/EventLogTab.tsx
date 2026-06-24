import type { GameEvent } from "../../rules/core/types";

interface Props {
  events: GameEvent[];
}

export function EventLogTab({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>No events yet. Apply moves to build the event log.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area">
      <div className="info-row">
        <div className="info-chip">Events: <span>{events.length}</span></div>
      </div>
      {events.map((ev, i) => (
        <div key={i} className="event-item">
          <div className="event-header">
            <span className="event-turn">Turn {ev.turn}</span>
            <span className="event-actor">{ev.actor}</span>
            <span className="event-action">{ev.action.id}</span>
            {Object.entries(ev.action.bindings).map(([k, v]) => (
              <span key={k} className="event-binding">{k}={v}</span>
            ))}
          </div>
          <div className="event-hashes">
            <span className="hash-label">prev:</span> {ev.previousStateHash}
            <span className="hash-sep">→</span>
            <span className="hash-label">next:</span> {ev.nextStateHash}
          </div>
        </div>
      ))}
    </div>
  );
}
