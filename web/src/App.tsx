import { useState } from "react";
import LiveCall from "./components/LiveCall";
import Overview from "./components/Overview";
import Conversations from "./components/Conversations";
import Leads from "./components/Leads";
import Bookings from "./components/Bookings";
import Questions from "./components/Questions";
import ScriptView from "./components/ScriptView";

type Tab = "live" | "overview" | "conversations" | "leads" | "bookings" | "questions" | "script";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live call" },
  { id: "overview", label: "Overview" },
  { id: "conversations", label: "Conversations" },
  { id: "leads", label: "Leads" },
  { id: "bookings", label: "Bookings" },
  { id: "questions", label: "Questions" },
  { id: "script", label: "Script" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [inCall, setInCall] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="flex flex-col gap-4 border-b border-line px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-brand">
            <span className={`h-2 w-2 rounded-full bg-brand ${inCall ? "animate-pulse" : ""}`} />
            Lipi.ai · {inCall ? "Call in progress" : "Agent online"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Company voice desk</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            One script file runs the whole call — every line and every objection. A PDF-backed RAG index
            answers open-ended questions. Groq only understands what the caller meant. Three agents, 24 leads
            to practice on.
          </p>
        </div>
        <p className="text-xs text-muted sm:text-right">Browser voice now · Phone via Vapi when keys are set</p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-line px-6 py-3" aria-label="Dashboard">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={inCall}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === t.id ? "bg-brand text-bg" : "border border-line text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="px-6 py-6">
        <div className={tab === "live" ? "" : "hidden"}>
          <LiveCall onInCallChange={setInCall} />
        </div>
        {tab === "overview" && <Overview />}
        {tab === "conversations" && <Conversations />}
        {tab === "leads" && <Leads />}
        {tab === "bookings" && <Bookings />}
        {tab === "questions" && <Questions />}
        {tab === "script" && <ScriptView />}
      </main>
    </div>
  );
}
