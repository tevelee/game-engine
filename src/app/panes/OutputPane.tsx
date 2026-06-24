import { useState } from "react";
import type {
  CompileError,
  CompiledPlan,
  ActionInstance,
  ActionTrace,
  GameEvent,
  GridState,
  GameRuntime,
  Outcome,
} from "../../rules/core/types";
import { ErrorsTab } from "./ErrorsTab";
import { RulebookTab } from "./RulebookTab";
import { CompiledPlanTab } from "./CompiledPlanTab";
import { PlayTab } from "./PlayTab";
import { LegalActionsTab } from "./LegalActionsTab";
import { TraceTab } from "./TraceTab";
import { EventLogTab } from "./EventLogTab";
import { ReplayTab } from "./ReplayTab";

type Tab = "errors" | "rulebook" | "plan" | "play" | "legal" | "trace" | "log" | "replay";

interface Props {
  parseError: string | null;
  errors: CompileError[];
  rulebook: string | null;
  plan: CompiledPlan | null;
  runtime: GameRuntime | null;
  state: GridState | null;
  outcome: Outcome | null;
  lastTrace: ActionTrace | null;
  events: GameEvent[];
  onAction: (action: ActionInstance) => void;
  onLastTrace: (action: ActionInstance) => void;
}

export function OutputPane(props: Props) {
  const [tab, setTab] = useState<Tab>("play");

  const { parseError, errors, rulebook, plan, runtime, state, outcome, lastTrace, events, onAction, onLastTrace } = props;

  const totalErrors = errors.length + (parseError ? 1 : 0);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "play", label: "Play" },
    { id: "legal", label: "Legal Actions" },
    { id: "trace", label: "Trace" },
    { id: "log", label: "Event Log", badge: events.length || undefined },
    { id: "replay", label: "Replay" },
    { id: "rulebook", label: "Rulebook" },
    { id: "plan", label: "Compiled Plan" },
    { id: "errors", label: "Errors", badge: totalErrors || undefined },
  ];

  return (
    <div className="output-pane">
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="badge">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === "errors" && <ErrorsTab errors={errors} parseError={parseError} />}
        {tab === "rulebook" && <RulebookTab rulebook={rulebook} />}
        {tab === "plan" && <CompiledPlanTab plan={plan} />}
        {tab === "play" && (
          <PlayTab
            runtime={runtime}
            plan={plan}
            state={state}
            outcome={outcome}
            onAction={onAction}
            onLastTrace={onLastTrace}
          />
        )}
        {tab === "legal" && <LegalActionsTab runtime={runtime} state={state} plan={plan} />}
        {tab === "trace" && <TraceTab trace={lastTrace} />}
        {tab === "log" && <EventLogTab events={events} />}
        {tab === "replay" && <ReplayTab runtime={runtime} plan={plan} events={events} />}
      </div>
    </div>
  );
}
