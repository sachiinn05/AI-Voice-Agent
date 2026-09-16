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
} from "./voice.js";

const leadsEl = document.getElementById("leads");
const callsEl = document.getElementById("calls");
const resultEl = document.getElementById("result");
const phoneEl = document.querySelector(".phone");
const statusEl = document.getElementById("status");
const viaBadge = document.getElementById("via-badge");
const nameEl = document.getElementById("name");
const metaEl = document.getElementById("meta");
const timerEl = document.getElementById("timer");
const captionEl = document.getElementById("caption");
const callBtn = document.getElementById("call-btn");
const testBtn = document.getElementById("test-btn");
const hangupBtn = document.getElementById("hangup-btn");
const replyBar = document.getElementById("reply-bar");
const talkBtn = document.getElementById("talk-btn");
const typedReply = document.getElementById("typed-reply");
const wave = document.getElementById("wave");

let leads = [];
let recentCalls = [];
let selectedCall = -1;
let selected = 0;
let callId = null;
let language = "en-IN";
let inCall = false;
let busy = false;
let startedAt = 0;
let tick = null;
let waveTick = null;
let silenceTimer = 0;
let listenerReady = false;
let nudges = 0;

function setPhase(phase) {
  phoneEl.classList.remove("ringing", "speaking", "listening", "ended");
  if (phase) phoneEl.classList.add(phase);
  const labels = {
    ringing: "Calling…",
    speaking: "Agent speaking",
    listening: "Your turn — say okay, or type it",
    ended: "Call ended",
  };
  statusEl.textContent = labels[phase] || "Ready";
}

function caption(who, text) {
  captionEl.textContent = `${who}: ${text}`;
}

function clock() {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function renderLeads() {
  leadsEl.innerHTML = leads
    .map(
      (lead, i) => `
      <button class="lead ${i === selected ? "active" : ""}" data-i="${i}" type="button">
        <strong>${lead.contact_name}</strong>
        <span class="meta">${lead.contact_role || lead.company_name}</span>
        <span class="lang">${lead.preferred_language}</span>
      </button>`,
    )
    .join("");
}

function showLead(lead) {
  nameEl.textContent = lead.contact_name;
  metaEl.textContent = `${lead.company_name} · ${lead.preferred_language}`;
}

async function loadLeads() {
  leads = await (await fetch("/api/leads")).json();
  renderLeads();
  if (leads[selected]) showLead(leads[selected]);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showResult(result, target = resultEl) {
  if (!target) return;
  if (!result) {
    target.innerHTML =
      `<p class="hint">When a call ends, the transcript opens here. Click a recent call to read it again.</p>`;
    return;
  }
  const lines = String(result.full_transcript || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const agent = /^agent:/i.test(line);
      const text = line.replace(/^(agent|prospect):\s*/i, "");
      return `<p class="t-line ${agent ? "t-agent" : "t-you"}"><strong>${agent ? "AI" : "You"}</strong>${escapeHtml(text)}</p>`;
    });
  const meeting = result.meeting_details?.date || result.meeting_details?.time || "";
  target.innerHTML = `
    <p class="dispo">${escapeHtml(result.disposition)} · score ${escapeHtml(result.lead_score)}</p>
    <p class="hint">${escapeHtml(result.call_summary || "")}</p>
    ${meeting ? `<p class="hint">Booked: ${escapeHtml(meeting)}</p>` : ""}
    ${sourceChips(result.knowledge_questions?.flatMap((q) => q.sources || []) || [])}
    <div class="transcript">${lines.join("") || `<p class="hint">No transcript saved for this call.</p>`}</div>
  `;
}

async function loadCalls() {
  recentCalls = await (await fetch("/api/calls")).json();
  callsEl.innerHTML = recentCalls.length
    ? recentCalls
        .slice(0, 8)
        .map(
          (c, i) => `
        <button class="call-row ${i === selectedCall ? "active" : ""}" data-call="${i}" type="button">
          <strong>${escapeHtml(c.disposition)}</strong>
          <span class="meta">${escapeHtml(c.lead?.company_name ?? "")} · score ${escapeHtml(c.lead_score)}</span>
        </button>`,
        )
        .join("")
    : `<p class="hint">No calls yet.</p>`;
}

// How long to wait before "can you still hear me?". Was 5.5s — in real calls
// that fired while the caller was mid-answer and still being recognized,
// and ended two engaged calls as "Not Interested" purely on the timeout.
const SILENCE_NUDGE_MS = 9000;

function armSilenceNudge() {
  window.clearTimeout(silenceTimer);
  silenceTimer = window.setTimeout(() => {
    if (inCall && !busy && !voice.speaking && nudges < 2) void sendNudge();
  }, SILENCE_NUDGE_MS);
}

function listenAgain() {
  if (!inCall || busy || voice.speaking) return;
  setPhase("listening");
  startListening();
  armSilenceNudge();
  typedReply.focus();
}

function attachListener() {
  if (listenerReady) return true;
  try {
    createListener({
      language,
      onPartial: (text) => {
        if (voice.speaking) return;
        caption("You", text);
        // They're talking — that's not silence. Push the nudge back.
        armSilenceNudge();
      },
      onFinal: (text) => {
        void sendUtterance(text);
      },
      onBargeIn: (text) => {
        void sendUtterance(text);
      },
      onIdle: () => {
        if (inCall && !busy && !voice.speaking) startListening();
      },
    });
    listenerReady = true;
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

function showVia(via, sources) {
  if (!viaBadge) return;
  if (via === "rag") {
    const labels = (sources || [])
      .slice(0, 2)
      .map((s) => (s.pageNumber ? `${s.fileName} p.${s.pageNumber}` : s.fileName));
    viaBadge.textContent = labels.length
      ? `Company knowledge · ${labels.join(" · ")}`
      : "Company knowledge · grounded in PDFs";
    viaBadge.className = "via-badge rag";
  } else if (via === "steer") {
    viaBadge.textContent = "Groq brought them back to the script";
    viaBadge.className = "via-badge groq";
  } else if (via === "groq") {
    viaBadge.textContent = "Groq heard you — speaking the script";
    viaBadge.className = "via-badge groq";
  } else if (via === "script") {
    viaBadge.textContent = "Script line — Groq did not change the words";
    viaBadge.className = "via-badge script";
  }
}

let fillers = [];
let lastFiller = "";

async function loadFillers(lang) {
  try {
    const res = await fetch(`/api/fillers?language=${encodeURIComponent(lang)}`);
    fillers = (await res.json()).fillers || [];
  } catch {
    fillers = [];
  }
}

/** Short "right, got it…" spoken while the real reply is still generating. */
async function playFiller() {
  if (!fillers.length || !inCall) return;
  // Don't repeat the same one twice in a row — that's what sounds robotic.
  const choices = fillers.length > 1 ? fillers.filter((f) => f !== lastFiller) : fillers;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  if (!pick) return;
  lastFiller = pick;
  setPhase("speaking");
  caption("Agent", pick);
  try {
    await speak(pick, language);
  } catch {
    /* filler is optional — never block the real reply on it */
  }
}

async function playAgent(text, via, sources) {
  caption("Agent", text);
  setPhase("speaking");
  showVia(via, sources);
  if (via === "rag") statusEl.textContent = "Agent speaking · company knowledge";
  if (via === "steer") statusEl.textContent = "Agent speaking · Groq steer";
  if (via === "groq") statusEl.textContent = "Agent speaking · Groq";
  if (via === "script") statusEl.textContent = "Agent speaking · script";
  window.clearTimeout(silenceTimer);
  await speak(text, language);
}

async function sendUtterance(text) {
  const said = text.trim();
  if (!callId || !said || busy) return;
  busy = true;
  nudges = 0;
  window.clearTimeout(silenceTimer);
  stopListening();
  caption("You", said);

  // Fire the request FIRST, then fill the dead air with a short "right,
  // got it…" while it's in flight. The backchannel is pre-cached server
  // side, so it costs ~0 added time and hides the LLM+TTS round trip —
  // which is what actually makes the agent feel slow. If the reply comes
  // back fast there's no dead air to fill, so skip it rather than padding.
  const pending = fetch("/api/simulate/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, text: said }),
  });
  const raced = await Promise.race([
    pending.then(() => "ready").catch(() => "ready"),
    new Promise((resolve) => setTimeout(() => resolve("slow"), 350)),
  ]);
  if (raced === "slow") await playFiller();

  const res = await pending;
  const data = await res.json();
  await playAgent(data.agent, data.via, data.sources);
  busy = false;
  if (data.ended) {
    await finish(data.result);
    return;
  }
  listenAgain();
}

async function sendNudge() {
  if (!callId || busy) return;
  nudges += 1;
  busy = true;
  const res = await fetch("/api/simulate/nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });
  const data = await res.json();
  await playAgent(data.agent, data.via);
  busy = false;
  if (data.ended) {
    await finish(data.result);
    return;
  }
  listenAgain();
}

async function finish(result) {
  inCall = false;
  busy = false;
  listenerReady = false;
  nudges = 0;
  window.clearTimeout(silenceTimer);
  stopListening();
  stopSpeaking();
  closeMic();
  clearInterval(tick);
  callBtn.hidden = false;
  testBtn.hidden = false;
  hangupBtn.hidden = true;
  replyBar.hidden = true;
  callId = null;
  setPhase("ended");
  if (result) {
    selectedCall = 0;
    showResult(result);
  }
  await loadCalls();
}

async function hangup() {
  if (!callId) {
    await finish(null);
    return;
  }
  window.clearTimeout(silenceTimer);
  stopListening();
  const res = await fetch("/api/simulate/hangup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });
  const data = await res.json();
  if (data.agent) await playAgent(data.agent, "script");
  await finish(data.result);
}

async function startCall() {
  const lead = leads[selected];
  if (!lead || inCall) return;
  callBtn.disabled = true;
  language = lead.preferred_language;
  listenerReady = false;
  nudges = 0;
  lastFiller = "";
  void loadFillers(language);

  try {
    await unlockAudio();
  } catch {
    captionEl.textContent = "Click Call again so the browser can unlock sound.";
    callBtn.disabled = false;
    return;
  }

  await ensureMic();

  inCall = true;
  setPhase("ringing");
  captionEl.textContent = `Calling ${lead.contact_name.split(" ")[0]}…`;

  const res = await fetch("/api/simulate/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  const data = await res.json();
  callId = data.callId;
  startedAt = Date.now();
  tick = setInterval(clock, 250);
  callBtn.hidden = true;
  testBtn.hidden = true;
  hangupBtn.hidden = false;
  replyBar.hidden = false;
  callBtn.disabled = false;

  await playAgent(data.agent, data.via);
  if (!inCall) return;
  await ensureMic();
  listenAgain();
}

callsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-call]");
  if (!btn || inCall) return;
  selectedCall = Number(btn.dataset.call);
  showResult(recentCalls[selectedCall]);
  void loadCalls();
});

leadsEl.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-i]");
  if (!btn || inCall) return;
  selected = Number(btn.dataset.i);
  renderLeads();
  showLead(leads[selected]);
});

testBtn.addEventListener("click", async () => {
  testBtn.disabled = true;
  const lead = leads[selected];
  const lang = lead?.preferred_language || "en-IN";
  try {
    await unlockAudio();
    await ensureMic();
    setPhase("speaking");
    await speak("Hi, this is the company AI. You should hear me now. Press Call, then say okay.", lang);
    setPhase("");
    captionEl.textContent = "Speaker works. Press Call, then say okay.";
  } catch {
    captionEl.textContent = "Unmute this Chrome tab, then click Test speaker again.";
  }
  testBtn.disabled = false;
});

talkBtn.addEventListener("click", async () => {
  const ok = await ensureMic();
  if (!ok) {
    captionEl.textContent = "Allow the microphone, or type okay in the box.";
    typedReply.focus();
    return;
  }
  listenAgain();
  captionEl.textContent = "Listening… say okay.";
});

replyBar.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = typedReply.value;
  typedReply.value = "";
  void sendUtterance(text);
});

callBtn.addEventListener("click", () => {
  void startCall();
});
hangupBtn.addEventListener("click", () => {
  void hangup();
});

function paint() {
  drawWave(wave, inCall);
  waveTick = requestAnimationFrame(paint);
}
paint();

function sourceChips(sources) {
  if (!sources?.length) return "";
  return `<div class="sources">${sources
    .slice(0, 6)
    .map((s) => `<span class="source-chip">${escapeHtml(s.fileName)}${s.pageNumber ? ` p.${s.pageNumber}` : ""}</span>`)
    .join("")}</div>`;
}

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${name}`));
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  if (name === "overview") void loadOverview();
  if (name === "conversations") void loadConversations();
  if (name === "leads") void loadLeadTable();
  if (name === "bookings") void loadBookings();
  if (name === "questions") void loadQuestions();
  if (name === "knowledge") void loadKnowledge();
}

async function loadOverview() {
  const data = await (await fetch("/api/dashboard")).json();
  const stats = data.stats || {};
  document.getElementById("stat-cards").innerHTML = [
    ["Calls", stats.calls],
    ["Booked", stats.booked],
    ["Leads", stats.leads],
    ["Questions", stats.questions],
    ["PDFs", stats.documents],
    ["Chunks", stats.chunks],
  ]
    .map(([label, value]) => `<div class="card"><strong>${escapeHtml(value ?? 0)}</strong><span>${label}</span></div>`)
    .join("");
  document.getElementById("overview-activity").innerHTML = (data.recentCalls || []).length
    ? data.recentCalls
        .map(
          (c) => `<div class="lead"><strong>${escapeHtml(c.disposition)}</strong><span class="meta">${escapeHtml(c.lead?.contact_name || "")} · ${escapeHtml(c.lead?.company_name || "")}</span></div>`,
        )
        .join("")
    : `<p class="hint">No calls yet.</p>`;
}

async function loadConversations() {
  const calls = await (await fetch("/api/calls")).json();
  recentCalls = calls;
  const list = document.getElementById("all-calls");
  list.innerHTML = calls.length
    ? calls
        .map(
          (c, i) => `<button class="call-row" data-all="${i}" type="button"><strong>${escapeHtml(c.disposition)}</strong><span class="meta">${escapeHtml(c.lead?.contact_name || "")} · ${escapeHtml(c.lead?.company_name || "")}</span></button>`,
        )
        .join("")
    : `<p class="hint">No conversations yet.</p>`;
}

document.getElementById("all-calls")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-all]");
  if (!btn) return;
  const call = recentCalls[Number(btn.dataset.all)];
  if (call) showResult(call, document.getElementById("conversation-detail"));
});

async function loadLeadTable() {
  const rows = await (await fetch("/api/leads")).json();
  document.getElementById("lead-table").innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Language</th><th>Need</th></tr></thead>
      <tbody>${rows
        .map(
          (lead) => `<tr><td>${escapeHtml(lead.contact_name)}</td><td>${escapeHtml(lead.company_name)}</td><td>${escapeHtml(lead.contact_role || "")}</td><td>${escapeHtml(lead.preferred_language)}</td><td>${escapeHtml(lead.need_for_bot || lead.company_description)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;
}

async function loadBookings() {
  const rows = await (await fetch("/api/bookings")).json();
  document.getElementById("booking-list").innerHTML = rows.length
    ? rows
        .map(
          (b) => {
            const when = [b.meeting?.date, b.meeting?.time].filter(Boolean);
            const slot = when[0] === when[1] ? when[0] : when.join(" ");
            return `<div class="lead"><strong>${escapeHtml(b.contactName)} · ${escapeHtml(b.companyName)}</strong><span class="meta">${escapeHtml(slot || "")}</span></div>`;
          },
        )
        .join("")
    : `<p class="hint">No bookings yet.</p>`;
}

async function loadQuestions() {
  const rows = await (await fetch("/api/questions")).json();
  document.getElementById("question-list").innerHTML = rows.length
    ? rows
        .map(
          (q) => `<div class="lead"><strong>${escapeHtml(q.question)}</strong><span class="meta">${escapeHtml(q.answer)}</span>${sourceChips(q.sources)}${q.grounded ? "" : `<span class="meta">Not enough document coverage</span>`}</div>`,
        )
        .join("")
    : `<p class="hint">No company questions asked yet.</p>`;
}

async function loadKnowledge() {
  const data = await (await fetch("/api/knowledge")).json();
  const status = document.getElementById("knowledge-status");
  const mongo = data.mongo?.configured ? (data.mongo.connected ? "Mongo connected" : "Mongo configured") : "Mongo not configured — set MONGODB_URI";
  status.textContent = `${mongo} · embeddings: ${data.embeddings?.provider || "n/a"} · ${data.chunks || 0} chunks`;
  const docs = data.documents || [];
  document.getElementById("document-list").innerHTML = docs.length
    ? docs
        .map(
          (doc) => `<div class="lead"><strong>${escapeHtml(doc.fileName)}</strong><span class="meta">${doc.pageCount} pages · ${doc.chunkCount} chunks · ${escapeHtml(doc.status)}</span><button class="danger" data-del="${escapeHtml(doc.documentId)}" data-file="${escapeHtml(doc.fileName)}" type="button">Remove</button></div>`,
        )
        .join("")
    : `<p class="hint">Database is ready, but it has no company documents yet. Choose 3–4 PDFs, then click Upload and ingest.</p>`;
}

document.getElementById("pdf-input")?.addEventListener("change", (event) => {
  const input = event.target;
  const label = document.getElementById("file-label");
  if (!label) return;
  const names = [...(input.files || [])].map((file) => file.name);
  label.textContent = names.length ? names.join(", ") : "No files selected";
});

document.querySelector(".tabs")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-view]");
  if (!btn || inCall) return;
  showView(btn.dataset.view);
});

document.getElementById("knowledge-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("pdf-input");
  if (!input?.files?.length) return;
  const body = new FormData();
  for (const file of input.files) body.append("files", file);
  const status = document.getElementById("knowledge-status");
  status.textContent = "Uploading and ingesting…";
  const res = await fetch("/api/knowledge", { method: "POST", body });
  const data = await res.json();
  status.textContent = data.error || (data.errors?.length ? data.errors.join(" · ") : `Ingested ${data.ingested?.length || 0} PDF(s).`);
  input.value = "";
  const label = document.getElementById("file-label");
  if (label) label.textContent = "No files selected";
  await loadKnowledge();
});

document.getElementById("reingest-btn")?.addEventListener("click", async () => {
  const status = document.getElementById("knowledge-status");
  status.textContent = "Re-ingesting knowledge folder…";
  const res = await fetch("/api/knowledge/ingest", { method: "POST" });
  const data = await res.json();
  status.textContent = data.error || `Ingested ${data.ingested?.length || 0}. ${data.skipped?.length ? data.skipped.join(" · ") : ""}`;
  await loadKnowledge();
});

document.getElementById("document-list")?.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-del]");
  if (!btn) return;
  await fetch(`/api/knowledge/${btn.dataset.del}?fileName=${encodeURIComponent(btn.dataset.file || "")}`, {
    method: "DELETE",
  });
  await loadKnowledge();
});

loadLeads();
loadCalls();
