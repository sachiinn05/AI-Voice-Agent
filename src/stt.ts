import { config } from "./config.js";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Free on the same Groq key already used for the LLM. Used only as the STT
// fallback for browsers without window.SpeechRecognition (Safari, Firefox,
// mobile) — the primary path stays the browser's own live recognition.
const WHISPER_MODEL = "whisper-large-v3-turbo";

// The script (and every intent/FAQ regex in src/script/) is written in
// romanized Hinglish — "nahi", "haan", "kitna" — not Devanagari. Whisper's
// "hi" language hint would transcribe in Devanagari script and silently
// break every regex downstream. listenLocale() in public/voice.js already
// makes this same call for the browser's own recognizer (hi-IN-hinglish
// listens as en-IN), so mirror it here rather than translating "correctly".
const LANGUAGE_HINT: Record<string, string> = {
  "en-US": "en",
  "en-IN": "en",
  "hi-IN-hinglish": "en",
};

function fileNameFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "audio.mp4";
  if (mimeType.includes("ogg")) return "audio.ogg";
  if (mimeType.includes("wav")) return "audio.wav";
  return "audio.webm";
}

/** Transcribes a recorded utterance via Groq's Whisper endpoint. */
export async function transcribeAudio(buffer: Buffer, mimeType: string, language: string): Promise<string> {
  if (!config.groqApiKey) throw new Error("GROQ_API_KEY not set — voice fallback needs it for transcription");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/webm" }), fileNameFor(mimeType));
  form.append("model", WHISPER_MODEL);
  const hint = LANGUAGE_HINT[language];
  if (hint) form.append("language", hint);

  const res = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.groqApiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq transcription failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}
