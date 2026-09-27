import { useEffect, useState } from "react";
import type { QuestionRow } from "../lib/types";

export default function Questions() {
  const [rows, setRows] = useState<QuestionRow[]>([]);

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink">Questions callers asked</h2>
      <p className="mb-3 text-xs text-muted">
        Answered from the PDF via RAG. Anything marked <strong className="text-ink">no match</strong> isn't covered by the
        ingested PDF yet.
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <p className="text-xs text-muted">No questions asked yet.</p>}
        {rows.map((q, i) => (
          <div key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
            <strong className="block text-ink">{q.question}</strong>
            <span className="text-muted">
              {q.contactName || ""} ·{" "}
              {q.faqId ? (
                <>RAG chunk: {q.faqId}</>
              ) : (
                <>
                  <b className="text-danger">no match</b> — not covered by the ingested PDF
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
