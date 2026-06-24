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
import { IRGameRuntime } from "../engine/runtime/IRGameRuntime";
import { ataxx } from "../engine/games/ataxx";
import { SchemaEditorPane } from "./panes/SchemaEditorPane";
import { OutputPane } from "./panes/OutputPane";

type AppMode = "schema" | "ir";

interface CompileState {
  parseError: string | null;
  errors: CompileError[];
  rulebook: string | null;
  plan: CompiledPlan | null;
  runtime: GameRuntime | null;
  gameState: GridState | null;
  outcome: Outcome | null;
}

function irAtaxxMinimalPlan(): CompiledPlan {
  return {
    runtime: "grid-v1",
    grid: { width: ataxx.board.width, height: ataxx.board.height },
    players: ataxx.players,
    relations: {},
    actions: [],
    setup: ataxx.setup.flatMap((eff) => {
      if (eff.kind === "placePiece") {
        const at = eff.at.kind === "lit" ? String(eff.at.value) : "";
        const owner = eff.owner.kind === "lit" ? String(eff.owner.value) : "";
        return [{ place: eff.pieceType, owner, at }];
      }
      return [];
    }),
    end: [],
    result: { type: "maxPieceCount", piece: "stone", tie: "draw" },
  };
}

function runIRMode(): CompileState {
  const rt = new IRGameRuntime(ataxx);
  const initial = rt.initialState();
  return {
    parseError: null,
    errors: [],
    rulebook: null,
    plan: irAtaxxMinimalPlan(),
    runtime: rt,
    gameState: initial,
    outcome: rt.outcome(initial),
  };
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
  const [mode, setMode] = useState<AppMode>("schema");
  const [schema, setSchema] = useState(exampleInfectionGridJson);
  const [compiled, setCompiled] = useState<CompileState>(() =>
    runCompile(exampleInfectionGridJson)
  );
  const [compileCount, setCompileCount] = useState(0);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [lastTrace, setLastTrace] = useState<ActionTrace | null>(null);

  const switchMode = useCallback((next: AppMode) => {
    setMode(next);
    setEvents([]);
    setLastTrace(null);
    if (next === "ir") {
      setCompiled(runIRMode());
      setCompileCount((n) => n + 1);
    } else {
      const result = runCompile(schema);
      setCompiled(result);
      setCompileCount((n) => n + 1);
    }
  }, [schema]);

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
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className={`tab-btn${mode === "schema" ? " active" : ""}`}
            onClick={() => switchMode("schema")}
            title="Schema-based game (JSON editor)"
          >
            Schema
          </button>
          <button
            className={`tab-btn${mode === "ir" ? " active" : ""}`}
            onClick={() => switchMode("ir")}
            title="IR-based Ataxx (typed game engine)"
          >
            IR · Ataxx
          </button>
        </div>
      </header>

      <div className="panes">
        {mode === "schema" && (
          <SchemaEditorPane
            value={schema}
            onChange={setSchema}
            onCompile={compile}
            hasErrors={hasErrors}
          />
        )}
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
