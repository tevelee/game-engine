import type { CompileError } from "../../rules/core/types";

interface Props {
  errors: CompileError[];
  parseError: string | null;
}

export function ErrorsTab({ errors, parseError }: Props) {
  if (!parseError && errors.length === 0) {
    return (
      <div className="scroll-area">
        <div className="success-banner">No errors. Schema compiled successfully.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area">
      {parseError && (
        <div className="error-item">
          <div className="error-path">/</div>
          <div className="error-msg">Parse error: {parseError}</div>
        </div>
      )}
      {errors.map((e, i) => (
        <div key={i} className="error-item">
          <div className="error-path">{e.path}</div>
          <div className="error-msg">{e.message}</div>
        </div>
      ))}
    </div>
  );
}
