import { useEffect, useState } from "react";
import type { DashboardData } from "../lib/types";

export default function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const stats = data?.stats;
  const cards: [string, number | undefined][] = [
    ["Calls", stats?.calls],
    ["Booked", stats?.booked],
    ["Leads", stats?.leads],
    ["Questions", stats?.questions],
    ["No match", stats?.unanswered],
    ["PDF chunks", stats?.ragChunks],
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <strong className="block text-2xl font-semibold text-ink">{value ?? 0}</strong>
            <span className="text-xs text-muted">{label}</span>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Recent activity</h2>
        <div className="flex flex-col gap-1.5">
          {(data?.recentCalls ?? []).length === 0 && <p className="text-xs text-muted">No calls yet.</p>}
          {(data?.recentCalls ?? []).map((c, i) => (
            <div key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
              <strong className="block text-ink">{c.disposition}</strong>
              <span className="text-muted">
                {c.lead?.contact_name || ""} · {c.lead?.company_name || ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
