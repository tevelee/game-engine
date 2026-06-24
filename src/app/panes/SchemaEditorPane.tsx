import { useRef } from "react";
import { exampleInfectionGridJson } from "../../rules/compiler/exampleInfectionGrid";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onCompile: () => void;
  hasErrors: boolean;
}

export function SchemaEditorPane({ value, onChange, onCompile, hasErrors }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleFormat() {
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onCompile();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = ref.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = value.slice(0, start) + "  " + value.slice(end);
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  return (
    <div className="editor-pane">
      <div className="editor-header">
        <span className="pane-title">Schema Input</span>
        <div className="editor-actions">
          <button onClick={handleFormat} title="Format JSON">Format</button>
          <button onClick={() => onChange(exampleInfectionGridJson)} title="Reset to Infection Grid example">
            Reset Example
          </button>
          <button
            className="primary"
            onClick={onCompile}
            title="Compile (Ctrl+Enter)"
          >
            ▶ Compile
          </button>
        </div>
      </div>

      <textarea
        ref={ref}
        className="schema-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />

      <div className="editor-footer">
        {hasErrors ? (
          <span className="footer-error">Compile errors — check the Errors tab</span>
        ) : (
          <span className="footer-ok">Ready</span>
        )}
        <span className="footer-hint">Ctrl+Enter to compile</span>
      </div>
    </div>
  );
}
