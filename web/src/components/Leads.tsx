import { useEffect, useState } from "react";
import type { Lead } from "../lib/types";

const COLUMNS: [keyof Lead, string][] = [
  ["contact_name", "Name"],
  ["company_name", "Company"],
  ["industry", "Industry"],
  ["contact_role", "Role"],
  ["preferred_language", "Language"],
];

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then(setLeads);
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">Leads</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map(([, label]) => (
                <th key={label} className="border-b border-line px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">
                  {label}
                </th>
              ))}
              <th className="border-b border-line px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">Need</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.contact_number}>
                {COLUMNS.map(([key]) => (
                  <td key={key} className="border-b border-line px-2 py-2 text-ink">
                    {String(lead[key] ?? "")}
                  </td>
                ))}
                <td className="border-b border-line px-2 py-2 text-muted">{lead.need_for_bot || lead.company_description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
