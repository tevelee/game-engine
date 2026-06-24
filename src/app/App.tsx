import { useState, useCallback } from "react";
import "./App.css";
import type {
  GridState,
  ActionInstance,
  ActionTrace,
  GameEvent,
  CompiledPlan,
  CompileError,
  GameRuntime,
  Outcome,
} from "../rules/core/types";
import { exampleInfectionGridJson } from "../rules/compiler/exampleInfectionGrid";
import { compileRuleset } from "../rules/compiler/compileRuleset";
import { GridRuntime } from "../rules/runtime-grid/GridRuntime";
import { SchemaEditorPane } from "./panes/SchemaEditorPane";
import { OutputPane } from "./panes/OutputPane";

interface CompileState {
  parseError: string | null;
  errors: CompileError[];
  rulebook: string | null;
  plan: CompiledPlan | null;
  runtime: GameRuntime | null;
  gameState: GridState | null;
  outcome: Outcome | null;
}

function runCompile(schemaText: string): CompileState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaText);
  } catch (e) {
    return {
      parseError: (e as Error).message,
      errors: [],
      rulebook: null,
      plan: null,
      runtime: null,
      gameState: null,
      outcome: null,
    };
  }

  const result = compileRuleset(parsed as never);

  if (result.success && result.plan) {
    const rt = new GridRuntime(result.plan);
    const initial = rt.initialState();
    return {
      parseError: null,
      errors: [],
      rulebook: result.rulebook,
      plan: result.plan,
      runtime: rt,
      gameState: initial,
      outcome: rt.outcome(initial),
    };
  }

  return {
    parseError: null,
    errors: result.errors,
    rulebook: result.rulebook,
    plan: result.plan,
    runtime: null,
    gameState: null,
    outcome: null,
  };
}

export function App() {
  const [schema, setSchema] = useState(exampleInfectionGridJson);
  const [compiled, setCompiled] = useState<CompileState>(() =>
    runCompile(exampleInfectionGridJson)
  );
  const [compileCount, setCompileCount] = useState(0);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [lastTrace, setLastTrace] = useState<ActionTrace | null>(null);

  const compile = useCallback(() => {
    const result = runCompile(schema);
    setCompiled(result);
    setCompileCount((n) => n + 1);
    setEvents([]);
    setLastTrace(null);
  }, [schema]);

  const handleNewGame = useCallback(() => {
    const { runtime } = compiled;
    if (!runtime) return;
    const initial = runtime.initialState();
    setCompiled((prev) => ({
      ...prev,
      gameState: initial,
      outcome: runtime.outcome(initial),
    }));
    setEvents([]);
    setLastTrace(null);
  }, [compiled]);

  const handleAction = useCallback(
    (action: ActionInstance) => {
      const { runtime, gameState, outcome } = compiled;
      if (!runtime || !gameState || outcome) return;
      const result = runtime.apply(gameState, action);
      const newOutcome = runtime.outcome(result.state);
      setCompiled((prev) => ({
        ...prev,
        gameState: result.state,
        outcome: newOutcome,
      }));
      setLastTrace(result.trace);
      setEvents((prev) => [...prev, result.event]);
    },
    [compiled]
  );

  const handleLastTrace = useCallback(
    (action: ActionInstance) => {
      const { runtime, gameState } = compiled;
      if (!runtime || !gameState) return;
      setLastTrace(runtime.explain(gameState, action));
    },
    [compiled]
  );

  const hasErrors =
    compiled.parseError !== null || compiled.errors.length > 0;

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="app-title">Rule Compiler Playground</span>
        <span className="app-subtitle">debuggable game-rule compiler workbench</span>
      </header>

      <div className="panes">
        <SchemaEditorPane
          value={schema}
          onChange={setSchema}
          onCompile={compile}
          hasErrors={hasErrors}
        />
        <OutputPane
          parseError={compiled.parseError}
          errors={compiled.errors}
          rulebook={compiled.rulebook}
          plan={compiled.plan}
          runtime={compiled.runtime}
          state={compiled.gameState}
          outcome={compiled.outcome}
          lastTrace={lastTrace}
          events={events}
          onAction={handleAction}
          onLastTrace={handleLastTrace}
          onNewGame={handleNewGame}
          compileCount={compileCount}
        />
      </div>
    </div>
  );
}
