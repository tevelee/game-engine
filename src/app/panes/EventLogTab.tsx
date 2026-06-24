import { useState } from "react";
import type { GameEvent } from "../../rules/core/types";

interface Props {
  events: GameEvent[];
}

export function EventLogTab({ events }: Props) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [copied, setCopied] = useState(false);

  if (events.length === 0) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>
          No events yet. Apply moves to build the event log.
        </div>
      </div>
    );
  }

  const displayed = newestFirst ? [...events].reverse() : events;

  function copyLog() {
    navigator.clipboard.writeText(JSON.stringify(events, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="scroll-area">
      <div className="log-toolbar">
        <div className="info-row" style={{ margin: 0 }}>
          <div className="info-chip">
            Events: <span>{events.length}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="replay-follow" style={{ fontSize: 12, color: "var(--text-dim)" }}>
            <input
              type="checkbox"
              checked={newestFirst}
              onChange={(e) => setNewestFirst(e.target.checked)}
            />
            Newest first
          </label>
          <button onClick={copyLog} style={{ fontSize: 11 }}>
            {copied ? "Copied!" : "Copy JSON"}
          </button>
        </div>
      </div>

      {displayed.map((ev, i) => {
        const idx = newestFirst ? events.length - 1 - i : i;
        return (
          <div key={idx} className="event-item">
            <div className="event-header">
              <span className="event-index">#{idx + 1}</span>
              <span className="event-turn">Turn {ev.turn}</span>
              <span className="event-actor">{ev.actor}</span>
              <span className="event-action">{ev.action.id}</span>
              {Object.entries(ev.action.bindings).map(([k, v]) => (
                <span key={k} className="event-binding">
                  {k}={v}
                </span>
              ))}
            </div>
            <div className="event-hashes">
              <span className="hash-label">state:</span>{" "}
              {ev.previousStateHash}
              <span className="hash-sep">→</span>
              {ev.nextStateHash}
            </div>
          </div>
        );
      })}
    </div>
  );
}
