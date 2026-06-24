import { useMemo } from "react";
import { printIRGame } from "../../engine/ir/printer";
import { ataxx } from "../../engine/games/ataxx";
import type { IRGame } from "../../engine/ir/types";

interface Props {
  game?: IRGame;
}

export function IRTab({ game = ataxx }: Props) {
  const text = useMemo(() => printIRGame(game), [game]);

  return (
    <div className="scroll-area">
      <pre style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: "12px",
        lineHeight: "1.5",
        margin: 0,
        whiteSpace: "pre",
        color: "var(--text)",
      }}>
        {text}
      </pre>
    </div>
  );
}
