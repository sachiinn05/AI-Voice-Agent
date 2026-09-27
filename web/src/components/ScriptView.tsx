import { useEffect, useState } from "react";
import type { ScriptView as ScriptViewData } from "../lib/types";

function isLine(value: unknown): value is { en: string; hi: string } {
  return Boolean(value && typeof value === "object" && "en" in (value as object) && "hi" in (value as object));
}

function ScriptNode({ obj, depth = 0 }: { obj: Record<string, unknown>; depth?: number }) {
  return (
    <>
      {Object.entries(obj).map(([key, value]) => {
        const indent = { marginLeft: depth * 14 };
        if (isLine(value)) {
          return (
            <div key={key} style={indent} className="border-b border-dashed border-line py-1.5">
              <strong className="text-sm text-ink">{key}</strong>
              <p className="text-xs text-ink">
                <b className="mr-1 inline-block w-6 text-[10px] uppercase text-muted">en</b>
                {value.en}
              </p>
              <p className="text-xs text-ink">
                <b className="mr-1 inline-block w-6 text-[10px] uppercase text-muted">hi</b>
                {value.hi}
              </p>
            </div>
          );
        }
        if (Array.isArray(value)) {
          return (
            <div key={key} style={indent} className="border-b border-dashed border-line py-1.5">
              <strong className="text-sm text-ink">{key}</strong>
              <span className="block text-xs text-muted">
                {value.map((v) => (typeof v === "string" ? v : (v as { id?: string }).id || JSON.stringify(v))).join(" · ")}
              </span>
            </div>
          );
        }
        if (value && typeof value === "object") {
          return (
            <div key={key} style={indent} className="my-1.5 border-l-2 border-line pl-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">{key}</h3>
              <ScriptNode obj={value as Record<string, unknown>} depth={depth + 1} />
            </div>
          );
        }
        return (
          <div key={key} style={indent} className="border-b border-dashed border-line py-1.5">
            <strong className="text-sm text-ink">{key}</strong>
            <span className="block text-xs text-muted">{String(value)}</span>
          </div>
        );
      })}
    </>
  );
}

export default function ScriptView() {
  const [data, setData] = useState<ScriptViewData | null>(null);

  useEffect(() => {
    fetch("/api/script")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return null;
  const { faq: _faq, ...rest } = data.script as Record<string, unknown>;
  const rag = data.rag;

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink">The script</h2>
      <p className="mb-3 text-xs text-muted">
        Every line the agent can say, read from <code className="text-ink">{data.path}</code>. Edit that file and restart to
        change the call.
      </p>
      <ScriptNode obj={rest} />
      <div className="my-1.5 border-l-2 border-line pl-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">Knowledge (PDF RAG)</h3>
        {rag ? (
          <div className="border-b border-dashed border-line py-1.5">
            <strong className="text-sm text-ink">{rag.source}</strong>
            <span className="block text-xs text-muted">
              {rag.chunks} chunks · {rag.model} · indexed {rag.createdAt}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">
            No index yet — run <code className="text-ink">npm run ingest</code> after setting GEMINI_API_KEY.
          </p>
        )}
      </div>
    </section>
  );
}
