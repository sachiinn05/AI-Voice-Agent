/**
 * List the free Edge neural voices, and optionally render the same sample
 * line through several of them so you can listen and pick.
 *
 *   npm run voices                 # list en-IN / hi-IN / multilingual voices
 *   npm run voices -- --all        # list every voice Edge exposes
 *   npm run voices -- --sample     # write A/B samples to .voice-samples/
 */
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const SAMPLE_LINES: Array<{ tag: string; voices: string[]; text: string }> = [
  {
    tag: "en-US",
    voices: ["en-US-AvaMultilingualNeural", "en-US-EmmaMultilingualNeural", "en-US-JennyNeural"],
    text: "Hi Emily, this is BrightSmile's AI assistant calling on behalf of Sachin. It'll only take a minute — is now an okay time?",
  },
  {
    tag: "en-IN",
    voices: ["en-IN-NeerjaExpressiveNeural", "en-IN-NeerjaNeural", "en-IN-PrabhatNeural"],
    text: "Thanks. Quick question — how is FreshBasket handling those order-status calls flooding your line today?",
  },
  {
    tag: "hinglish",
    voices: ["en-IN-NeerjaExpressiveNeural", "en-IN-NeerjaNeural"],
    text: "Namaste Ananya, main Aarohi Connect ka AI assistant hoon, Sachin ki taraf se call kar raha hoon. Ek minute milega?",
  },
];

async function list(all: boolean) {
  const voices = await new MsEdgeTTS().getVoices();
  const rows = all
    ? voices
    : voices.filter((v) => /^(hi-IN|en-IN|en-US)/.test(v.Locale) || /Multilingual/i.test(v.ShortName));
  for (const v of rows) {
    console.log(`${v.ShortName.padEnd(44)} ${v.Locale.padEnd(8)} ${v.Gender}`);
  }
  console.log(`\n${rows.length} shown of ${voices.length} total.`);
  console.log("Set TTS_EDGE_VOICE_EN_US / TTS_EDGE_VOICE_EN_IN / TTS_EDGE_VOICE_HINGLISH in .env to switch.");
}

async function sample() {
  const dir = ".voice-samples";
  await mkdir(dir, { recursive: true });
  for (const { tag, voices, text } of SAMPLE_LINES) {
    for (const voice of voices) {
      const file = `${dir}/${tag}__${voice}.mp3`;
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = tts.toStream(text, { rate: 0.92, pitch: "-2Hz" });
        await new Promise<void>((resolve, reject) => {
          const out = createWriteStream(file);
          audioStream.pipe(out);
          out.on("finish", () => resolve());
          out.on("error", reject);
          setTimeout(() => reject(new Error("timed out")), 15000);
        });
        console.log(`wrote ${file}`);
      } catch (error) {
        console.log(`failed ${voice}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  console.log(`\nPlay the files in ${dir}/ and pick the voice you like best.`);
}

const args = process.argv.slice(2);
if (args.includes("--sample")) await sample();
else await list(args.includes("--all"));
