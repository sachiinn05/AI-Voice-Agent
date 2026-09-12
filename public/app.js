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
        <span class="meta">${lead.company_name} · ${lead.contact_role || "role n/a"}</span>
        <span class="lang">${lead.preferred_language} · voice call</span>
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

function showResult(result) {
  if (!result) {
    resultEl.innerHTML =
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
  resultEl.innerHTML = `
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

function armSilenceNudge() {
  window.clearTimeout(silenceTimer);
  silenceTimer = window.setTimeout(() => {
    if (inCall && !busy && !voice.speaking && nudges < 2) void sendNudge();
  }, 5500);
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
        if (!voice.speaking) caption("You", text);
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

function showVia(via) {
  if (!viaBadge) return;
  if (via === "steer") {
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

async function playAgent(text, via) {
  caption("Agent", text);
  setPhase("speaking");
  showVia(via);
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
  const res = await fetch("/api/simulate/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, text: said }),
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
  const res = await fetch("/api/simulate/hangup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId }),
  });
  const data = await res.json();
  await finish(data.result);
}

async function startCall() {
  const lead = leads[selected];
  if (!lead || inCall) return;
  callBtn.disabled = true;
  language = lead.preferred_language;
  listenerReady = false;
  nudges = 0;

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
    await speak("Hi, this is Lipi's AI. You should hear me now. Press Call, then say okay.", lang);
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

loadLeads();
loadCalls();
