import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const execFileAsync = promisify(execFile);

const VOICES: Record<string, string> = {
  "en-US": "en-US-JennyNeural",
  "en-IN": "en-IN-NeerjaNeural",
  "hi-IN-hinglish": "en-IN-NeerjaNeural",
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

async function edgeSpeak(text: string, language: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    VOICES[language] ?? VOICES["en-IN"] ?? "en-IN-NeerjaNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
  );
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

export async function synthesizeSpeech(
  text: string,
  language: string,
): Promise<{ buffer: Buffer; type: string }> {
  const line = text.trim().slice(0, 1200);
  if (!line) throw new Error("Nothing to speak");
  try {
    return { buffer: await edgeSpeak(line, language), type: "audio/mpeg" };
  } catch (error) {
    console.warn("Edge TTS failed, using Windows voice:", error);
    return windowsSpeak(line, language);
  }
}
