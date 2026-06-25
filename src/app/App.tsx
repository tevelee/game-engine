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
import { tictactoe } from "../engine/games/tictactoe";
import { reversi } from "../engine/games/reversi";
import type { IRGame } from "../engine/ir/types";
import { generateRulebook } from "../engine/ir/rulebook";
import { compile } from "../engine/ir/compile";
import type { CompiledRuleset } from "../engine/ir/compile";
import { SchemaEditorPane } from "./panes/SchemaEditorPane";
import { OutputPane } from "./panes/OutputPane";

type AppMode = "schema" | "ir";

const IR_GAMES: { id: string; label: string; game: IRGame }[] = [
  { id: "ataxx",      label: "Ataxx",      game: ataxx      },
  { id: "tictactoe",  label: "Tic-tac-toe", game: tictactoe  },
  { id: "reversi",    label: "Reversi",     game: reversi    },
];

interface CompileState {
  parseError: string | null;
  errors: CompileError[];
  rulebook: string | null;
  plan: CompiledPlan | CompiledRuleset | null;
  runtime: GameRuntime | null;
  gameState: GridState | null;
  outcome: Outcome | null;
}

function runIRMode(game: IRGame): CompileState {
  const rt = new IRGameRuntime(game);
  const initial = rt.initialState();
  return {
    parseError: null,
    errors: [],
    rulebook: generateRulebook(game),
    plan: compile(game),
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
  const [selectedIRGame, setSelectedIRGame] = useState(IR_GAMES[0]);
  const [schema, setSchema] = useState(exampleInfectionGridJson);
  const [compiled, setCompiled] = useState<CompileState>(() =>
    runCompile(exampleInfectionGridJson)
  );
  const [compileCount, setCompileCount] = useState(0);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [lastTrace, setLastTrace] = useState<ActionTrace | null>(null);

  const switchMode = useCallback((next: AppMode, irGame = selectedIRGame) => {
    setMode(next);
    setEvents([]);
    setLastTrace(null);
    if (next === "ir") {
      setCompiled(runIRMode(irGame.game));
      setCompileCount((n) => n + 1);
    } else {
      const result = runCompile(schema);
      setCompiled(result);
      setCompileCount((n) => n + 1);
    }
  }, [schema, selectedIRGame]);

  const switchIRGame = useCallback((entry: typeof IR_GAMES[number]) => {
    setSelectedIRGame(entry);
    setMode("ir");
    setEvents([]);
    setLastTrace(null);
    setCompiled(runIRMode(entry.game));
    setCompileCount((n) => n + 1);
  }, []);

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
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <button
            className={`tab-btn${mode === "schema" ? " active" : ""}`}
            onClick={() => switchMode("schema")}
            title="Schema-based game (JSON editor)"
          >
            Schema
          </button>
          <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>IR:</span>
          {IR_GAMES.map((entry) => (
            <button
              key={entry.id}
              className={`tab-btn${mode === "ir" && selectedIRGame.id === entry.id ? " active" : ""}`}
              onClick={() => switchIRGame(entry)}
              title={`IR game: ${entry.label}`}
            >
              {entry.label}
            </button>
          ))}
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
          irGame={mode === "ir" ? selectedIRGame.game : undefined}
        />
      </div>
    </div>
  );
}
