import ReactMarkdown from "react-markdown";

interface Props {
  rulebook: string | null;
}

export function RulebookTab({ rulebook }: Props) {
  if (!rulebook) {
    return (
      <div className="scroll-area">
        <div style={{ color: "var(--text-dim)" }}>Compile a valid schema to see the generated rulebook.</div>
      </div>
    );
  }

  return (
    <div className="scroll-area rulebook">
      <ReactMarkdown>{rulebook}</ReactMarkdown>
    </div>
  );
}
