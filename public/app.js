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

function showVia(via, faqId) {
  if (!viaBadge) return;
  if (via === "faq") {
    viaBadge.textContent = `Answered from the script FAQ · ${faqId || ""}`.trim();
    viaBadge.className = "via-badge rag";
  } else if (via === "steer") {
    viaBadge.textContent = "Script line, said Groq's way — same facts";
    viaBadge.className = "via-badge groq";
  } else if (via === "groq") {
    viaBadge.textContent = "Groq heard you — speaking the script";
    viaBadge.className = "via-badge groq";
  } else if (via === "script") {
    viaBadge.textContent = "Script line — word for word";
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

async function playAgent(text, via, faqId) {
  caption("Agent", text);
  setPhase("speaking");
  showVia(via, faqId);
  if (via === "faq") statusEl.textContent = "Agent speaking · script FAQ";
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
  await playAgent(data.agent, data.via, data.faqId);
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

function showView(name) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${name}`));
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
  if (name === "overview") void loadOverview();
  if (name === "conversations") void loadConversations();
  if (name === "leads") void loadLeadTable();
  if (name === "bookings") void loadBookings();
  if (name === "questions") void loadQuestions();
  if (name === "script") void loadScriptView();
}

async function loadOverview() {
  const data = await (await fetch("/api/dashboard")).json();
  const stats = data.stats || {};
  document.getElementById("stat-cards").innerHTML = [
    ["Calls", stats.calls],
    ["Booked", stats.booked],
    ["Leads", stats.leads],
    ["Questions", stats.questions],
    ["No match", stats.unanswered],
    ["FAQ entries", stats.faqEntries],
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
          (q) =>
            `<div class="lead"><strong>${escapeHtml(q.question)}</strong><span class="meta">${escapeHtml(q.contactName || "")} · ${
              q.faqId ? "FAQ: " + escapeHtml(q.faqId) : "<b>no match</b> — add it to scripts/call-script.yaml"
            }</span></div>`,
        )
        .join("")
    : `<p class="hint">No questions asked yet.</p>`;
}

function scriptLines(obj, depth = 0) {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (value && typeof value === "object" && "en" in value && "hi" in value) {
        return `<div class="script-beat" style="margin-left:${depth * 14}px"><strong>${escapeHtml(key)}</strong><p class="t-line t-agent"><b>en</b>${escapeHtml(value.en)}</p><p class="t-line t-agent"><b>hi</b>${escapeHtml(value.hi)}</p></div>`;
      }
      if (Array.isArray(value)) {
        return `<div class="script-beat" style="margin-left:${depth * 14}px"><strong>${escapeHtml(key)}</strong><span class="meta">${value.map((v) => escapeHtml(typeof v === "string" ? v : v.id || JSON.stringify(v))).join(" · ")}</span></div>`;
      }
      if (value && typeof value === "object") {
        return `<div class="script-section" style="margin-left:${depth * 14}px"><h3>${escapeHtml(key)}</h3>${scriptLines(value, depth + 1)}</div>`;
      }
      return `<div class="script-beat" style="margin-left:${depth * 14}px"><strong>${escapeHtml(key)}</strong><span class="meta">${escapeHtml(String(value))}</span></div>`;
    })
    .join("");
}

async function loadScriptView() {
  const data = await (await fetch("/api/script")).json();
  const pathEl = document.getElementById("script-path");
  if (pathEl) pathEl.textContent = data.path;
  const { faq, ...rest } = data.script;
  const faqHtml = (faq || [])
    .map(
      (f) =>
        `<div class="script-beat"><strong>${escapeHtml(f.id)}</strong><span class="meta">asked as: ${f.ask.map(escapeHtml).join(" / ")}</span><p class="t-line t-agent"><b>en</b>${escapeHtml(f.en)}</p><p class="t-line t-agent"><b>hi</b>${escapeHtml(f.hi)}</p></div>`,
    )
    .join("");
  document.getElementById("script-view").innerHTML =
    scriptLines(rest) + `<div class="script-section"><h3>faq (${(faq || []).length})</h3>${faqHtml}</div>`;
}

document.querySelector(".tabs")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-view]");
  if (!btn || inCall) return;
  showView(btn.dataset.view);
});

loadLeads();
loadCalls();
