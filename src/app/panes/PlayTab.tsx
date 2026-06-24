import type { GridState, ActionInstance, GameRuntime, Outcome, CompiledPlan } from "../../rules/core/types";
import { Board } from "../../ui/Board";

interface Props {
  runtime: GameRuntime | null;
  plan: CompiledPlan | null;
  state: GridState | null;
  outcome: Outcome | null;
  onAction: (action: ActionInstance) => void;
  onLastTrace: (action: ActionInstance) => void;
  onNewGame: () => void;
}

export function PlayTab({ runtime, plan, state, outcome, onAction, onLastTrace, onNewGame }: Props) {
  if (!runtime || !plan || !state) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Compile a valid schema to start playing.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area" style={{ display: "flex", justifyContent: "center" }}>
      <Board
        state={state}
        runtime={runtime}
        players={plan.players}
        width={plan.grid.width}
        height={plan.grid.height}
        outcome={outcome}
        onAction={onAction}
        onLastTrace={onLastTrace}
        onNewGame={onNewGame}
      />
    </div>
  );
}
