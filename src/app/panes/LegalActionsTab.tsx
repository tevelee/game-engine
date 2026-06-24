import type { ActionInstance, GridState, GameRuntime, CompiledPlan } from "../../rules/core/types";
import { JsonViewer } from "../../ui/JsonViewer";

interface Props {
  runtime: GameRuntime | null;
  state: GridState | null;
  plan: CompiledPlan | null;
}

export function LegalActionsTab({ runtime, state, plan }: Props) {
  if (!runtime || !state || !plan) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Compile a valid schema to see legal actions.</div>
      </div>
    );
  }

  const actions = runtime.legalActions(state);
  const byId: Record<string, ActionInstance[]> = {};
  for (const a of actions) {
    if (!byId[a.id]) byId[a.id] = [];
    byId[a.id].push(a);
  }

  return (
    <div className="scroll-area">
      <div className="info-row">
        <div className="info-chip">Total: <span>{actions.length}</span></div>
        {Object.entries(byId).map(([id, list]) => (
          <div key={id} className="info-chip">{id}: <span>{list.length}</span></div>
        ))}
      </div>
      <JsonViewer data={actions} />
    </div>
  );
}
