import type { GridState, ActionInstance, GameRuntime, Outcome } from "../../rules/core/types";
import type { BoardMeta } from "./OutputPane";
import { Board } from "../../ui/Board";

interface Props {
  runtime: GameRuntime | null;
  board: BoardMeta | null;
  state: GridState | null;
  outcome: Outcome | null;
  onAction: (action: ActionInstance) => void;
  onLastTrace: (action: ActionInstance) => void;
  onNewGame: () => void;
}

export function PlayTab({ runtime, board, state, outcome, onAction, onLastTrace, onNewGame }: Props) {
  if (!runtime || !board || !state) {
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
        players={board.players}
        width={board.width}
        height={board.height}
        outcome={outcome}
        onAction={onAction}
        onLastTrace={onLastTrace}
        onNewGame={onNewGame}
      />
    </div>
  );
}
