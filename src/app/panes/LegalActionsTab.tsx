import { useState } from "react";
import type { ActionInstance, GridState, GameRuntime, CompiledPlan } from "../../rules/core/types";

interface Props {
  runtime: GameRuntime | null;
  state: GridState | null;
  plan: CompiledPlan | null;
}

export function LegalActionsTab({ runtime, state, plan }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  if (!runtime || !state || !plan) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>
          Compile a valid schema to see legal actions.
        </div>
      </div>
    );
  }

  const actions = runtime.legalActions(state);
  const byId: Record<string, ActionInstance[]> = {};
  for (const a of actions) {
    if (!byId[a.id]) byId[a.id] = [];
    byId[a.id].push(a);
  }

  function toggleGroup(id: string) {
    setExpandedGroup((prev) => (prev === id ? null : id));
    setExpandedItems(new Set());
  }

  function toggleItem(globalIdx: number) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(globalIdx) ? next.delete(globalIdx) : next.add(globalIdx);
      return next;
    });
  }

  let globalIdx = 0;

  return (
    <div className="scroll-area">
      <div className="info-row">
        <div className="info-chip">
          Total: <span>{actions.length}</span>
        </div>
        {Object.entries(byId).map(([id, list]) => (
          <div key={id} className="info-chip">
            {id}: <span>{list.length}</span>
          </div>
        ))}
        <div className="info-chip">
          Player: <span>{plan.players[state.currentPlayer]}</span>
        </div>
      </div>

      {actions.length === 0 && (
        <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
          No legal actions available.
        </div>
      )}

      {Object.entries(byId).map(([id, list]) => {
        const isOpen = expandedGroup === id;
        const groupStart = globalIdx;
        globalIdx += list.length;

        return (
          <div key={id} className="action-group">
            <button
              className="action-group-header"
              onClick={() => toggleGroup(id)}
            >
              <span className={`action-group-chevron ${isOpen ? "open" : ""}`}>▶</span>
              <span className="action-group-id">{id}</span>
              <span className="action-group-count">{list.length} action{list.length !== 1 ? "s" : ""}</span>
            </button>

            {isOpen && (
              <div className="action-group-body">
                {list.map((action, i) => {
                  const idx = groupStart + i;
                  const isExpanded = expandedItems.has(idx);
                  return (
                    <div key={i} className="action-row">
                      <button
                        className="action-row-summary"
                        onClick={() => toggleItem(idx)}
                      >
                        <span className="action-row-chevron">{isExpanded ? "▼" : "▶"}</span>
                        <span className="action-actor">{action.actor}</span>
                        {Object.entries(action.bindings).map(([k, v]) => (
                          <span key={k} className="action-binding">
                            {k}=<strong>{v}</strong>
                          </span>
                        ))}
                      </button>
                      {isExpanded && (
                        <pre className="action-json">
                          {JSON.stringify(action, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
