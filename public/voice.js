const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export const voice = {
  stream: null,
  analyser: null,
  audioCtx: null,
  recognition: null,
  speaking: false,
  ignoreUntil: 0,
  player: new Audio(),
  objectUrl: "",
  currentText: "",
};

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Without headphones, the mic can pick up the agent's own TTS coming out of
 * the speaker — browser echo cancellation isn't guaranteed to fully catch
 * audio played from a plain <audio> element the way it does a real call. If
 * what was "heard" is mostly just the sentence the agent is currently
 * speaking, treat it as echo, not a genuine interruption.
 */
export function looksLikeEcho(heard, spoken) {
  const h = normalizeWords(heard || "");
  const s = normalizeWords(spoken || "");
  if (!h || !s) return false;
  if (s.includes(h)) return true;
  const heardWords = h.split(" ");
  const spokenWords = new Set(s.split(" "));
  const overlap = heardWords.filter((w) => spokenWords.has(w)).length;
  return overlap / heardWords.length >= 0.7;
}

const LOCALE = {
  "en-US": "en-US",
  "en-IN": "en-IN",
  "hi-IN-hinglish": "hi-IN",
};

export function ttsLocale(language) {
  return LOCALE[language] || "en-IN";
}

export function listenLocale(language) {
  return language === "hi-IN-hinglish" ? "en-IN" : ttsLocale(language);
}

export async function unlockAudio() {
  if (!voice.audioCtx) voice.audioCtx = new AudioContext();
  if (voice.audioCtx.state === "suspended") await voice.audioCtx.resume();
  voice.player.src = SILENT_WAV;
  voice.player.volume = 0.01;
  try {
    await voice.player.play();
  } catch {
    /* click already consumed; later play() still works on the same element */
  }
  voice.player.pause();
  voice.player.volume = 1;

  const osc = voice.audioCtx.createOscillator();
  const gain = voice.audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 520;
  gain.gain.value = 0.07;
  osc.connect(gain);
  gain.connect(voice.audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, voice.audioCtx.currentTime + 0.28);
  osc.stop(voice.audioCtx.currentTime + 0.3);
}

export async function openMic() {
  voice.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  if (!voice.audioCtx) voice.audioCtx = new AudioContext();
  if (voice.audioCtx.state === "suspended") await voice.audioCtx.resume();
  const source = voice.audioCtx.createMediaStreamSource(voice.stream);
  voice.analyser = voice.audioCtx.createAnalyser();
  voice.analyser.fftSize = 256;
  source.connect(voice.analyser);
}

export function closeMic() {
  voice.stream?.getTracks().forEach((t) => t.stop());
  voice.stream = null;
  voice.analyser = null;
}

export function drawWave(canvas, active) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = active ? "#3ee08f" : "#2a3848";

  if (!voice.analyser || !active) {
    for (let i = 0; i < 24; i += 1) {
      ctx.fillRect(14 + i * 12, h / 2 - 3, 5, 6);
    }
    return;
  }

  const data = new Uint8Array(voice.analyser.frequencyBinCount);
  voice.analyser.getByteFrequencyData(data);
  for (let i = 0; i < 24; i += 1) {
    const mag = data[i + 2] ?? 0;
    const bar = Math.max(6, (mag / 255) * (h - 8));
    ctx.fillRect(14 + i * 12, (h - bar) / 2, 5, bar);
  }
}

function waitForPlayer(player) {
  return new Promise((resolve, reject) => {
    const done = () => {
      player.onended = null;
      player.onerror = null;
      resolve();
    };
    player.onended = done;
    player.onerror = () => {
      player.onended = null;
      player.onerror = null;
      reject(new Error("audio element failed"));
    };
  });
}

function waitForVoices() {
  const existing = speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 800);
  });
}

async function speakBrowser(text, language) {
  await waitForVoices();
  speechSynthesis.cancel();
  await new Promise((r) => setTimeout(r, 60));
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = ttsLocale(language);
  utter.volume = 1;
  const voices = speechSynthesis.getVoices();
  const prefer =
    language === "hi-IN-hinglish"
      ? ["hi-IN", "hi", "en-IN"]
      : language === "en-IN"
        ? ["en-IN", "en-GB", "en-US"]
        : ["en-US", "en"];
  const chosen = voices.find((v) => prefer.some((p) => v.lang.replace("_", "-").startsWith(p)));
  if (chosen) utter.voice = chosen;
  await new Promise((resolve, reject) => {
    utter.onend = resolve;
    utter.onerror = () => reject(new Error("browser TTS failed"));
    speechSynthesis.speak(utter);
  });
}

export async function speak(text, language) {
  stopSpeaking();
  voice.speaking = true;
  voice.ignoreUntil = Date.now() + 400;
  voice.currentText = text;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!res.ok) throw new Error("server TTS failed");
    const blob = await res.blob();
    if (voice.objectUrl) URL.revokeObjectURL(voice.objectUrl);
    voice.objectUrl = URL.createObjectURL(blob);
    voice.player.src = voice.objectUrl;
    voice.player.volume = 1;
    await voice.player.play();
    await waitForPlayer(voice.player);
  } catch {
    await speakBrowser(text, language);
  } finally {
    voice.speaking = false;
  }
}

export function stopSpeaking() {
  voice.player.pause();
  voice.player.currentTime = 0;
  speechSynthesis.cancel();
  voice.speaking = false;
}

// A complete one-or-two-word acknowledgment. When the interim transcript is
// exactly this, there's nothing more coming — send it now instead of waiting
// out the pause timer. This is what made "haan" / "okay" feel slow.
const SHORT_ACK_RE =
  /^(haan|han|ham|hn|haa|hain|hanji|haanji|ji|hmm|ok|okay|yes|yeah|yep|yup|sure|theek|thik|theek hai|thik hai|bilkul|achha|accha)(\s+(haan|han|ji|ok|okay|yes|hai|bilkul))?$/i;

export function createListener({ language, onPartial, onFinal, onBargeIn, onIdle }) {
  if (!SpeechRecognition) {
    throw new Error("This browser cannot listen. Use Chrome or Edge.");
  }
  const recognition = new SpeechRecognition();
  recognition.lang = listenLocale(language);
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let pauseTimer = 0;

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last) return;
    const text = last[0]?.transcript?.trim() ?? "";
    if (!text) return;

    if (voice.speaking) {
      if (Date.now() < voice.ignoreUntil) return;
      if (looksLikeEcho(text, voice.currentText)) return;
      if (/\b(okay|ok|haan|stop|wait)\b/i.test(text) || text.split(/\s+/).length >= 2) {
        stopSpeaking();
        onBargeIn?.(text);
      }
      return;
    }

    onPartial?.(text);
    window.clearTimeout(pauseTimer);
    if (last.isFinal) {
      onFinal?.(text);
      return;
    }
    // Fast path: a bare "haan" / "okay" is complete the moment we hear it.
    // Everything else waits a beat so we don't cut a sentence off after its
    // first word (a real call logged "call" … "call" from "we call them
    // back" being ended too early).
    const wait = SHORT_ACK_RE.test(text.replace(/[.,!?]+$/, "")) ? 150 : 850;
    pauseTimer = window.setTimeout(() => onFinal?.(text), wait);
  };

  recognition.onend = () => {
    onIdle?.();
  };

  voice.recognition = recognition;
  return recognition;
}

export function startListening() {
  try {
    voice.recognition?.start();
  } catch {
    /* already started */
  }
}

export function stopListening() {
  try {
    voice.recognition?.stop();
  } catch {
    /* already stopped */
  }
}
