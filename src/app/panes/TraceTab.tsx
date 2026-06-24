import type { ActionTrace } from "../../rules/core/types";

interface Props {
  trace: ActionTrace | null;
}

export function TraceTab({ trace }: Props) {
  if (!trace) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Apply a move to see the debug trace.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area">
      <section className="trace-section">
        <h3>Action</h3>
        <div className="info-row">
          <div className="info-chip">id: <span>{trace.action}</span></div>
          <div className="info-chip">actor: <span>{trace.actor}</span></div>
          {Object.entries(trace.bindings).map(([k, v]) => (
            <div key={k} className="info-chip">{k}: <span>{v}</span></div>
          ))}
        </div>
      </section>

      <section className="trace-section">
        <h3>Binding Trace</h3>
        {trace.bindingTrace.map((entry, i) => (
          <div key={i} className="trace-entry">
            <div className="trace-entry-header">
              <strong>{entry.binding}</strong>
              <span className="trace-selected"> → {entry.selected}</span>
            </div>
            <div className="trace-explanation">{entry.explanation}</div>
            <div className="trace-candidates">
              candidates: [{entry.candidates.map((c, j) => (
                <span key={j} className={c === entry.selected ? "cand selected" : "cand"}>{c}</span>
              ))}]
            </div>
          </div>
        ))}
      </section>

      <section className="trace-section">
        <h3>Effect Trace</h3>
        {trace.effectTrace.map((entry, i) => (
          <div key={i} className="trace-entry">
            <div className="trace-entry-header">
              <strong>{entry.effect}</strong>
            </div>
            <div className="trace-explanation">{entry.explanation}</div>
            {entry.cellChanges.length > 0 && (
              <div className="cell-changes">
                {entry.cellChanges.map((c, j) => (
                  <div key={j} className="cell-change">
                    {c.cell}: {c.before} → {c.after}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="trace-section">
        <h3>End Condition Check</h3>
        {trace.endConditionTrace.map((entry, i) => (
          <div key={i} className="trace-entry end-cond">
            <span className={entry.result ? "cond-true" : "cond-false"}>
              {entry.result ? "✓" : "✗"}
            </span>
            <span>{entry.id}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
