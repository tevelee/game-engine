import { useState, useEffect, useRef } from "react";
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
import { IRTab } from "./IRTab";

type Tab = "errors" | "rulebook" | "plan" | "ir" | "play" | "legal" | "trace" | "log" | "replay";

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
  onNewGame: () => void;
  // compile counter — increments each time user hits Compile
  compileCount: number;
}

export function OutputPane(props: Props) {
  const [tab, setTab] = useState<Tab>("play");
  const prevCompile = useRef(props.compileCount);

  const {
    parseError, errors, rulebook, plan, runtime, state,
    outcome, lastTrace, events, onAction, onLastTrace, onNewGame, compileCount,
  } = props;

  const totalErrors = errors.length + (parseError ? 1 : 0);

  // Auto-switch to Errors when compile produces errors
  useEffect(() => {
    if (compileCount !== prevCompile.current) {
      prevCompile.current = compileCount;
      if (totalErrors > 0) {
        setTab("errors");
      } else {
        setTab("play");
      }
    }
  }, [compileCount, totalErrors]);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "play", label: "Play" },
    { id: "legal", label: "Legal Actions" },
    { id: "trace", label: "Trace", badge: lastTrace ? events.length : undefined },
    { id: "log", label: "Event Log", badge: events.length || undefined },
    { id: "replay", label: "Replay" },
    { id: "rulebook", label: "Rulebook" },
    { id: "plan", label: "Compiled Plan" },
    { id: "ir", label: "IR" },
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
              <span className="badge">{t.badge > 99 ? "99+" : t.badge}</span>
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
            onNewGame={onNewGame}
          />
        )}
        {tab === "legal" && <LegalActionsTab runtime={runtime} state={state} plan={plan} />}
        {tab === "trace" && <TraceTab trace={lastTrace} />}
        {tab === "log" && <EventLogTab events={events} />}
        {tab === "replay" && <ReplayTab runtime={runtime} plan={plan} events={events} />}
        {tab === "ir" && <IRTab />}
      </div>
    </div>
  );
}
