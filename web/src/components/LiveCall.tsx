import { useEffect, useMemo, useRef, useState } from "react";
import {
  closeMic,
  createListener,
  drawWave,
  openMic,
  speak,
  startListening,
  stopListening,
  stopSpeaking,
  unlockAudio,
  voice,
} from "../lib/voice.js";
import type { Agent, CallResult, Lead, ReplyVia } from "../lib/types";

type Phase = "idle" | "ringing" | "speaking" | "listening" | "ended";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  ringing: "Calling…",
  speaking: "Agent speaking",
  listening: "Your turn — say okay, or type it",
  ended: "Call ended",
};

const PHASE_RING: Record<Phase, string> = {
  idle: "border-line",
  ringing: "border-speak animate-pulse",
  speaking: "border-speak",
  listening: "border-brand",
  ended: "border-danger",
};

// Was 5.5s — in real calls that fired while the caller was mid-answer and
// still being recognized, and ended two engaged calls as "Not Interested"
// purely on the timeout.
const SILENCE_NUDGE_MS = 9000;

function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function viaLabel(via: ReplyVia | "", faqId?: string | null): { text: string; tone: string } {
  if (via === "faq") return { text: `Answered from the PDF (RAG) · ${faqId || ""}`.trim(), tone: "bg-brand/15 text-brand" };
  if (via === "steer") return { text: "Script line, said Groq's way — same facts", tone: "bg-speak/15 text-speak" };
  if (via === "groq") return { text: "Groq heard you — speaking the script", tone: "bg-speak/15 text-speak" };
  if (via === "script") return { text: "Script line — word for word", tone: "bg-line text-muted" };
  return { text: "Script locked · Groq only hears intent", tone: "bg-line text-muted" };
}

export default function LiveCall({ onInCallChange }: { onInCallChange: (v: boolean) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallResult[]>([]);
  const [selectedCall, setSelectedCall] = useState(-1);
  const [result, setResult] = useState<CallResult | null>(null);

  const [inCall, setInCall] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [caption, setCaption] = useState("Say okay — or type it — when she's done talking.");
  const [via, setVia] = useState<{ via: ReplyVia | ""; faqId?: string | null }>({ via: "" });
  const [timerText, setTimerText] = useState("00:00");
  const [showCallScreen, setShowCallScreen] = useState(false);
  const [startCallDisabled, setStartCallDisabled] = useState(true);
  const [testDisabled, setTestDisabled] = useState(true);
  const [testStatus, setTestStatus] = useState("");
  const [hangupVisible, setHangupVisible] = useState(false);
  const [replyBarVisible, setReplyBarVisible] = useState(false);
  const [newCallVisible, setNewCallVisible] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [liveLog, setLiveLog] = useState<{ who: "agent" | "you"; text: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const languageRef = useRef<Agent["language"]>("en-IN");
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | undefined>(undefined);
  const silenceTimerRef = useRef<number | undefined>(undefined);
  const listenerReadyRef = useRef(false);
  const nudgesRef = useRef(0);
  const fillersRef = useRef<string[]>([]);
  const lastFillerRef = useRef("");
  const inCallRef = useRef(false);

  useEffect(() => {
    onInCallChange(inCall);
  }, [inCall, onInCallChange]);

  // --- initial data ---------------------------------------------------
  useEffect(() => {
    (async () => {
      const [a, l] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/leads").then((r) => r.json()),
      ]);
      setAgents(a);
      setLeads(l);
    })();
    void loadCalls();
  }, []);

  async function loadCalls() {
    const calls: CallResult[] = await (await fetch("/api/calls")).json();
    setRecentCalls(calls);
  }

  // --- waveform animation ----------------------------------------------
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      if (canvasRef.current) drawWave(canvasRef.current, inCallRef.current);
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [liveLog]);

  // --- derived ---------------------------------------------------------
  const currentAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId) || null, [agents, selectedAgentId]);

  const matchingLeads = useMemo(() => {
    if (!currentAgent) return [];
    const q = leadQuery.trim().toLowerCase();
    return leads
      .filter((lead) => lead.preferred_language === currentAgent.language)
      .filter((lead) => !q || `${lead.contact_name} ${lead.company_name} ${lead.industry}`.toLowerCase().includes(q));
  }, [leads, currentAgent, leadQuery]);

  useEffect(() => {
    setTestDisabled(!selectedAgentId);
  }, [selectedAgentId]);

  function selectAgent(id: string) {
    if (inCall || id === selectedAgentId) return;
    setSelectedAgentId(id);
    setSelectedLead(null);
    setLeadQuery("");
  }

  function selectLead(number: string) {
    const lead = matchingLeads.find((l) => l.contact_number === number);
    if (!lead) return;
    setSelectedLead(lead);
    setConfirmEmail(lead.email ?? "");
  }

  useEffect(() => {
    setStartCallDisabled(!selectedLead);
  }, [selectedLead]);

  // --- audio plumbing ----------------------------------------------------
  function armSilenceNudge() {
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      if (inCallRef.current && !busyRef.current && !voice.speaking && nudgesRef.current < 2) void sendNudge();
    }, SILENCE_NUDGE_MS);
  }

  function listenAgain() {
    if (!inCallRef.current || busyRef.current || voice.speaking) return;
    setPhase("listening");
    startListening();
    armSilenceNudge();
  }

  function attachListener() {
    if (listenerReadyRef.current) return true;
    try {
      createListener({
        language: languageRef.current,
        onPartial: (text: string) => {
          if (voice.speaking) return;
          setCaption(`You: ${text}`);
          armSilenceNudge();
        },
        onFinal: (text: string) => void sendUtterance(text),
        onBargeIn: (text: string) => void sendUtterance(text),
        onIdle: () => {
          if (inCallRef.current && !busyRef.current && !voice.speaking) startListening();
        },
      });
      listenerReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  async function ensureMic() {
    try {
      if (!voice.stream) await openMic();
      attachListener();
      return true;
    } catch {
      return false;
    }
  }

  async function loadFillers(lang: string) {
    try {
      const res = await fetch(`/api/fillers?language=${encodeURIComponent(lang)}`);
      fillersRef.current = (await res.json()).fillers || [];
    } catch {
      fillersRef.current = [];
    }
  }

  async function playFiller() {
    if (!fillersRef.current.length || !inCallRef.current) return;
    const choices =
      fillersRef.current.length > 1 ? fillersRef.current.filter((f) => f !== lastFillerRef.current) : fillersRef.current;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    lastFillerRef.current = pick;
    setPhase("speaking");
    setCaption(`Agent: ${pick}`);
    try {
      await speak(pick, languageRef.current);
    } catch {
      /* filler is optional — never block the real reply on it */
    }
  }

  async function playAgent(text: string, viaKind: ReplyVia, faqId?: string | null) {
    setCaption(`Agent: ${text}`);
    setLiveLog((l) => [...l, { who: "agent", text }]);
    setPhase("speaking");
    setVia({ via: viaKind, faqId });
    window.clearTimeout(silenceTimerRef.current);
    await speak(text, languageRef.current);
  }

  async function sendUtterance(text: string) {
    const said = text.trim();
    if (!callIdRef.current || !said || busyRef.current) return;
    busyRef.current = true;
    nudgesRef.current = 0;
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    setCaption(`You: ${said}`);
    setLiveLog((l) => [...l, { who: "you", text: said }]);

    // Fire the request first, then fill the dead air with a short "right,
    // got it…" while it's in flight — hides the LLM+TTS round trip, which is
    // what actually makes the agent feel slow.
    const pending = fetch("/api/simulate/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current, text: said }),
    });
    const raced = await Promise.race([
      pending.then(() => "ready").catch(() => "ready"),
      new Promise((resolve) => setTimeout(() => resolve("slow"), 350)),
    ]);
    if (raced === "slow") await playFiller();

    const res = await pending;
    const data = await res.json();
    await playAgent(data.agent, data.via, data.faqId);
    busyRef.current = false;
    if (data.ended) {
      await finish(data.result);
      return;
    }
    listenAgain();
  }

  async function sendNudge() {
    if (!callIdRef.current || busyRef.current) return;
    nudgesRef.current += 1;
    busyRef.current = true;
    const res = await fetch("/api/simulate/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current }),
    });
    const data = await res.json();
    await playAgent(data.agent, data.via);
    busyRef.current = false;
    if (data.ended) {
      await finish(data.result);
      return;
    }
    listenAgain();
  }

  async function finish(callResult: CallResult | null) {
    setInCall(false);
    inCallRef.current = false;
    busyRef.current = false;
    listenerReadyRef.current = false;
    nudgesRef.current = 0;
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    stopSpeaking();
    closeMic();
    window.clearInterval(tickRef.current);
    setHangupVisible(false);
    setReplyBarVisible(false);
    setNewCallVisible(true);
    callIdRef.current = null;
    setPhase("ended");
    if (callResult) {
      setSelectedCall(0);
      setResult(callResult);
    }
    await loadCalls();
  }

  async function hangup() {
    if (!callIdRef.current) {
      await finish(null);
      return;
    }
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    const res = await fetch("/api/simulate/hangup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current }),
    });
    const data = await res.json();
    if (data.agent) await playAgent(data.agent, "script");
    await finish(data.result);
  }

  async function startCall() {
    const lead = selectedLead;
    if (!lead || inCallRef.current) return;
    setStartCallDisabled(true);
    languageRef.current = lead.preferred_language;
    listenerReadyRef.current = false;
    nudgesRef.current = 0;
    lastFillerRef.current = "";
    void loadFillers(lead.preferred_language);

    setShowCallScreen(true);
    setNewCallVisible(false);
    setLiveLog([]);
    setTimerText("00:00");

    try {
      await unlockAudio();
    } catch {
      setCaption("Click Start call again so the browser can unlock sound.");
      setStartCallDisabled(false);
      setShowCallScreen(false);
      return;
    }

    await ensureMic();

    setInCall(true);
    inCallRef.current = true;
    setPhase("ringing");
    setCaption(`Calling ${lead.contact_name.split(" ")[0]}…`);

    const res = await fetch("/api/simulate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, email: confirmEmail.trim() }),
    });
    const data = await res.json();
    callIdRef.current = data.callId;
    startedAtRef.current = Date.now();
    tickRef.current = window.setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setTimerText(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }, 250);
    setHangupVisible(true);
    setReplyBarVisible(true);
    setStartCallDisabled(false);

    await playAgent(data.agent, data.via);
    if (!inCallRef.current) return;
    await ensureMic();
    listenAgain();
  }

  function resetToPicker() {
    setSelectedLead(null);
    setNewCallVisible(false);
    setShowCallScreen(false);
  }

  async function testSpeaker() {
    setTestDisabled(true);
    const lang = currentAgent?.language || selectedLead?.preferred_language || "en-IN";
    try {
      await unlockAudio();
      await ensureMic();
      setTestStatus("Playing a test line…");
      await speak("Hi, this is the company AI. You should hear me now.", lang);
      setTestStatus("Speaker works. Choose a lead, then Start call.");
    } catch {
      setTestStatus("Unmute this browser tab, then try Test speaker again.");
    }
    setTestDisabled(false);
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typedReply;
    setTypedReply("");
    void sendUtterance(text);
  }

  const viaShown = viaLabel(via.via, via.faqId);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr_300px]">
      {/* Agent picker */}
      <aside className="rounded-2xl border border-line bg-panel p-4">
        <StepLabel n={1} text="Choose your agent" />
        <p className="mb-3 text-xs text-muted">Same script and brain — a different voice and language each.</p>
        <div className="flex flex-col gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAgent(a.id)}
              className={`rounded-xl border p-3 text-left transition ${
                a.id === selectedAgentId ? "border-brand bg-brand/10" : "border-line hover:border-muted"
              }`}
            >
              <span className="mb-1 flex items-center justify-between text-xs text-muted">
                <span className="text-base">{a.flag}</span>
                <span>{a.voice.provider}</span>
              </span>
              <strong className="block text-sm text-ink">{a.name}</strong>
              <span className="text-xs text-muted">{a.tagline}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Center: picker or call screen */}
      <section className="min-h-[520px]">
        {!showCallScreen ? (
          <div className="flex h-full flex-col rounded-2xl border border-line bg-panel p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <StepLabel n={2} text="Choose a lead" />
                <p className="text-xs text-muted">
                  {currentAgent
                    ? `${matchingLeads.length} lead${matchingLeads.length === 1 ? "" : "s"} speak ${currentAgent.name.replace(" Agent", "")}.`
                    : "Pick an agent to see matching leads."}
                </p>
              </div>
              {currentAgent && (
                <input
                  type="search"
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  placeholder="Search leads…"
                  className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
              )}
            </div>

            <div className="grid flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {!currentAgent && <p className="text-sm text-muted">Choose an agent on the left to see who it can call.</p>}
              {currentAgent && matchingLeads.length === 0 && (
                <p className="text-sm text-muted">No leads match &quot;{leadQuery}&quot;.</p>
              )}
              {matchingLeads.map((lead) => (
                <button
                  key={lead.contact_number}
                  type="button"
                  onClick={() => selectLead(lead.contact_number)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                    selectedLead?.contact_number === lead.contact_number ? "border-brand bg-brand/10" : "border-line hover:border-muted"
                  }`}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-line text-xs font-semibold text-ink">
                    {initials(lead.contact_name)}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-ink">{lead.contact_name}</strong>
                    <span className="block truncate text-xs text-muted">
                      {lead.contact_role || ""} · {lead.company_name}
                    </span>
                    <span className="block truncate text-xs text-muted/80">{lead.need_for_bot || lead.company_description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-xs text-muted">
                {testStatus ||
                  (selectedLead ? (
                    <>
                      Ready to call <strong className="text-ink">{selectedLead.contact_name}</strong> at{" "}
                      {selectedLead.company_name}.
                    </>
                  ) : selectedAgentId ? (
                    "Select a lead to continue."
                  ) : (
                    "Select an agent, then a lead, to continue."
                  ))}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="Invite email (editable)"
                  title="Auto-filled from the lead. Change it to your own address to receive the real calendar invite + reminder."
                  className="w-52 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  disabled={testDisabled}
                  onClick={testSpeaker}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Test speaker
                </button>
                <button
                  type="button"
                  disabled={startCallDisabled}
                  onClick={() => void startCall()}
                  className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Start call
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="call-stage relative flex h-full min-h-[560px] flex-col overflow-hidden rounded-3xl border border-line">
            {/* status bar */}
            <div className="flex items-center justify-between gap-2 px-5 pt-4 text-xs">
              <span className="flex items-center gap-2 text-muted">
                <span className={`h-2 w-2 rounded-full ${inCall ? "animate-pulse bg-brand" : "bg-danger"}`} />
                {inCall ? "Connected" : "Call ended"}
              </span>
              <span className={`rounded-full px-2.5 py-1 font-medium ${viaShown.tone}`}>{viaShown.text}</span>
            </div>

            {/* avatar + identity */}
            <div className="flex flex-col items-center px-6 pt-5 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                {(phase === "speaking" || phase === "ringing") && (
                  <>
                    <span className="ripple absolute inset-0 rounded-full border border-speak/60" />
                    <span className="ripple absolute inset-0 rounded-full border border-speak/40 [animation-delay:0.8s]" />
                  </>
                )}
                {phase === "listening" && <span className="ripple absolute inset-0 rounded-full border border-brand/60" />}
                <span
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full border-2 bg-gradient-to-br from-panel2 to-line text-2xl font-semibold text-ink ${PHASE_RING[phase]}`}
                >
                  {selectedLead ? initials(selectedLead.contact_name) : "AI"}
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-ink">{selectedLead?.contact_name || "Select a contact"}</h2>
              <p className="text-xs text-muted">
                {selectedLead
                  ? `${selectedLead.contact_role ? selectedLead.contact_role + " · " : ""}${selectedLead.company_name}`
                  : "Lipi.ai outbound voice agent"}
              </p>
              <p className="mt-1 font-mono text-lg tracking-wider text-ink">{timerText}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    phase === "listening" ? "bg-brand" : phase === "speaking" || phase === "ringing" ? "bg-speak" : "bg-muted"
                  }`}
                />
                {PHASE_LABEL[phase]}
              </p>
              <div className="mt-3 rounded-full border border-line/60 bg-bg/40 p-1">
                <canvas ref={canvasRef} width={320} height={56} className="block max-w-full" />
              </div>
            </div>

            {/* live transcript */}
            <div className="mx-4 mt-4 flex-1 rounded-2xl bg-bg/40 p-3">
              <div className="flex max-h-56 min-h-[6rem] flex-col gap-2 overflow-y-auto">
                {liveLog.length === 0 && <p className="m-auto text-xs text-muted">{caption}</p>}
                {liveLog.map((m, i) => (
                  <div key={i} className={`bubble flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
                    <span
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm text-ink ${
                        m.who === "you" ? "rounded-br-sm bg-brand/20" : "rounded-bl-sm bg-panel2"
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {liveLog.length > 0 && phase === "listening" && caption.startsWith("You:") && (
                  <div className="flex justify-end">
                    <span className="max-w-[80%] rounded-2xl rounded-br-sm border border-dashed border-brand/40 px-3 py-2 text-sm italic text-muted">
                      {caption.replace(/^You:\s*/, "")}…
                    </span>
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* controls */}
            <div className="px-4 pb-5 pt-3">
              {replyBarVisible && (
                <form onSubmit={submitTyped} className="mb-4 flex items-center gap-2">
                  <input
                    type="text"
                    value={typedReply}
                    onChange={(e) => setTypedReply(e.target.value)}
                    placeholder="Type okay / haan if the mic misses you"
                    autoComplete="off"
                    className="flex-1 rounded-full border border-line bg-panel2 px-4 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-bg hover:brightness-110"
                  >
                    Send
                  </button>
                </form>
              )}
              <div className="flex items-center justify-center gap-6">
                {replyBarVisible && (
                  <button
                    type="button"
                    title="Tap to talk"
                    aria-label="Tap to talk"
                    onClick={async () => {
                      const ok = await ensureMic();
                      if (!ok) {
                        setCaption("Allow the microphone, or type okay in the box.");
                        return;
                      }
                      listenAgain();
                      setCaption("Listening… say okay.");
                    }}
                    className={`flex h-14 w-14 items-center justify-center rounded-full border text-xl transition hover:brightness-125 ${
                      phase === "listening" ? "border-brand bg-brand/20" : "border-line bg-panel2"
                    }`}
                  >
                    🎤
                  </button>
                )}
                {hangupVisible && (
                  <button
                    type="button"
                    title="End call"
                    aria-label="End call"
                    onClick={() => void hangup()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-2xl shadow-lg shadow-danger/30 transition hover:brightness-110"
                  >
                    <span className="rotate-[135deg]">📞</span>
                  </button>
                )}
                {newCallVisible && (
                  <button
                    type="button"
                    onClick={resetToPicker}
                    className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-bg hover:brightness-110"
                  >
                    New call
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* After call */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">After the call</h2>
          <TranscriptView result={result} />
        </div>
        <div className="rounded-2xl border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Recent</h2>
          <div className="flex flex-col gap-1.5">
            {recentCalls.length === 0 && <p className="text-xs text-muted">No calls yet.</p>}
            {recentCalls.slice(0, 8).map((c, i) => (
              <button
                key={c.call_id ?? i}
                type="button"
                disabled={inCall}
                onClick={() => {
                  setSelectedCall(i);
                  setResult(recentCalls[i] ?? null);
                }}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  i === selectedCall ? "border-brand bg-brand/10" : "border-line hover:border-muted"
                }`}
              >
                <strong className="block text-ink">{c.disposition}</strong>
                <span className="text-muted">
                  {c.lead?.company_name ?? ""} · score {c.lead_score}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-bg">{n}</span>
      {text}
    </div>
  );
}

export function TranscriptView({ result }: { result: CallResult | null }) {
  if (!result) {
    return <p className="text-xs text-muted">When a call ends, the transcript opens here. Click a recent call to read it again.</p>;
  }
  const lines = String(result.full_transcript || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const meeting = result.meeting_details?.date || result.meeting_details?.time || "";
  return (
    <div className="text-xs">
      <p className="font-semibold text-ink">
        {result.disposition} · score {result.lead_score}
      </p>
      {result.call_summary && <p className="mt-1 text-muted">{result.call_summary}</p>}
      {meeting && <p className="mt-1 text-muted">Booked: {meeting}</p>}
      <div className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {lines.length === 0 && <p className="text-muted">No transcript saved for this call.</p>}
        {lines.map((line, i) => {
          const isAgent = /^agent:/i.test(line);
          const text = line.replace(/^(agent|prospect):\s*/i, "");
          return (
            <p key={i} className={isAgent ? "text-ink" : "text-speak"}>
              <strong className="mr-1">{isAgent ? "AI" : "You"}</strong>
              {text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
