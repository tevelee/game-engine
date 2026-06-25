import type { CompiledPlan } from "../../rules/core/types";
import type { CompiledRuleset } from "../../engine/ir/compile";
import { JsonViewer } from "../../ui/JsonViewer";

interface Props {
  plan: CompiledPlan | CompiledRuleset | null;
}

export function CompiledPlanTab({ plan }: Props) {
  if (!plan) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Compile a valid schema to see the compiled runtime plan.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area">
      <JsonViewer data={plan} />
    </div>
  );
}
