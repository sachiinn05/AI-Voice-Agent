import { useEffect, useState } from "react";
import type { CallResult } from "../lib/types";
import { TranscriptView } from "./LiveCall";

export default function Conversations() {
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [active, setActive] = useState<CallResult | null>(null);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then(setCalls);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Calls</h2>
        <div className="flex flex-col gap-1.5">
          {calls.length === 0 && <p className="text-xs text-muted">No conversations yet.</p>}
          {calls.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(c)}
              className="rounded-lg border border-line px-3 py-2 text-left text-xs transition hover:border-muted"
            >
              <strong className="block text-ink">{c.disposition}</strong>
              <span className="text-muted">
                {c.lead?.contact_name || ""} · {c.lead?.company_name || ""}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Transcript</h2>
        <TranscriptView result={active} />
      </section>
    </div>
  );
}
