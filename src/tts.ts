import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const execFileAsync = promisify(execFile);

function env(name: string, fallback: string): string {
  return (process.env[name] ?? "").trim() || fallback;
}

/**
 * Edge neural voices, free and keyless. Override per language in .env to A/B
 * a different one — `npm run voices` lists every voice Edge exposes.
 *
 * Defaults:
 * - en-US: Ava (multilingual) is Microsoft's newer conversational voice and
 *   sounds markedly less "read-aloud" than the older Jenny.
 * - en-IN / Hinglish: Neerja Expressive carries more conversational prosody
 *   than plain Neerja. Note Hinglish is deliberately spoken by an
 *   Indian-English voice, not a hi-IN one: the script is romanized Hindi
 *   ("main aapki help kar sakta hoon") and hi-IN voices expect Devanagari.
 */
const VOICES: Record<string, string> = {
  "en-US": env("TTS_EDGE_VOICE_EN_US", "en-US-AvaMultilingualNeural"),
  "en-IN": env("TTS_EDGE_VOICE_EN_IN", "en-IN-NeerjaExpressiveNeural"),
  "hi-IN-hinglish": env("TTS_EDGE_VOICE_HINGLISH", "en-IN-NeerjaExpressiveNeural"),
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// setMetadata() opens a fresh WebSocket connection to Microsoft's TTS
// service — measured at ~1.8-2.3s of pure handshake overhead, paid again on
// every call if a new MsEdgeTTS() is created per request. One warm client
// per voice, reused across calls, cuts that to a one-time cost per voice
// per server process. Self-heals: a broken/idle-closed connection is
// discarded and rebuilt on the next request rather than failing forever.
const clients = new Map<string, MsEdgeTTS>();

async function getClient(voiceName: string): Promise<MsEdgeTTS> {
  const existing = clients.get(voiceName);
  if (existing) return existing;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  clients.set(voiceName, tts);
  return tts;
}

async function synthesizeOnce(tts: MsEdgeTTS, text: string): Promise<Buffer> {
  const result = tts.toStream(escapeXml(text), { rate: 0.92, pitch: "-2Hz" });
  const stream =
    result && typeof result === "object" && "audioStream" in result
      ? (result as { audioStream: NodeJS.ReadableStream }).audioStream
      : (result as unknown as NodeJS.ReadableStream);
  const audio = await Promise.race([
    collect(stream),
    new Promise<Buffer>((_, reject) => {
      setTimeout(() => reject(new Error("Edge TTS timed out")), 12000);
    }),
  ]);
  if (audio.length < 200) throw new Error("Edge TTS returned empty audio");
  return audio;
}

async function edgeSpeak(text: string, language: string): Promise<Buffer> {
  const voiceName = VOICES[language] ?? VOICES["en-IN"] ?? "en-IN-NeerjaNeural";
  try {
    const tts = await getClient(voiceName);
    return await synthesizeOnce(tts, text);
  } catch (error) {
    // Cached connection may have gone stale (idle timeout, network blip).
    // Drop it and retry once with a fresh client before giving up.
    clients.delete(voiceName);
    console.warn("Edge TTS client reconnecting after error:", error instanceof Error ? error.message : error);
    const tts = await getClient(voiceName);
    return synthesizeOnce(tts, text);
  }
}

async function windowsSpeak(text: string, language: string): Promise<{ buffer: Buffer; type: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "lipi-tts-"));
  const txt = path.join(dir, "line.txt");
  const wav = path.join(dir, "line.wav");
  await writeFile(txt, text, "utf8");
  const hint = language === "en-US" ? "Zira" : "Heera";
  const script = `
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $match = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like '*${hint}*' } | Select-Object -First 1
    if (-not $match) { $match = $s.GetInstalledVoices() | Select-Object -First 1 }
    if ($match) { $s.SelectVoice($match.VoiceInfo.Name) }
    $s.SetOutputToWaveFile('${wav.replaceAll("\\", "/")}')
    $s.Speak([System.IO.File]::ReadAllText('${txt.replaceAll("\\", "/")}'))
    $s.Dispose()
  `;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      timeout: 20000,
    });
    return { buffer: await readFile(wav), type: "audio/wav" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Most scripted lines (the opening, close, objection rebuttals) are
// deterministic — the same lead+language says the exact same sentence on
// every call. Caching the synthesized audio means a repeat is served from
// memory instantly instead of paying the ~1.5-2.5s network round trip to
// Microsoft's TTS service again. Bounded FIFO eviction keeps memory in check.
const AUDIO_CACHE_LIMIT = 200;
const audioCache = new Map<string, { buffer: Buffer; type: string }>();

/**
 * Synthesize a set of lines up front so they're already in the cache when the
 * call needs them. Used for the backchannels the agent says while thinking —
 * those must feel instant or they defeat their own purpose.
 */
export async function prewarmSpeech(lines: Array<{ text: string; language: string }>): Promise<number> {
  let warmed = 0;
  for (const line of lines) {
    try {
      await synthesizeSpeech(line.text, line.language);
      warmed += 1;
    } catch (error) {
      console.warn(`TTS prewarm skipped "${line.text.slice(0, 30)}":`, error instanceof Error ? error.message : error);
    }
  }
  return warmed;
}

export async function synthesizeSpeech(
  text: string,
  language: string,
): Promise<{ buffer: Buffer; type: string }> {
  const line = text.trim().slice(0, 1200);
  if (!line) throw new Error("Nothing to speak");

  const cacheKey = `${language}::${line}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  let result: { buffer: Buffer; type: string };
  try {
    result = { buffer: await edgeSpeak(line, language), type: "audio/mpeg" };
  } catch (error) {
    console.warn("Edge TTS failed, using Windows voice:", error);
    result = await windowsSpeak(line, language);
  }

  if (audioCache.size >= AUDIO_CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey !== undefined) audioCache.delete(oldestKey);
  }
  audioCache.set(cacheKey, result);
  return result;
}
