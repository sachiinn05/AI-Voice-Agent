import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export const config = {
  root,
  port: Number(env("PORT", "3000")),
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:3000"),
  founderName: env("FOUNDER_NAME", "Sachin"),
  companyName: env("COMPANY_NAME", "Lipi.ai"),
  meetingSlots: [
    env("MEETING_SLOT_1"),
    env("MEETING_SLOT_2"),
    env("MEETING_SLOT_3"),
  ].filter(Boolean),
  calBookingUrl: env("CAL_BOOKING_URL"),
  calApiKey: env("CAL_API_KEY"),
  calEventTypeId: env("CAL_EVENT_TYPE_ID"),
  vapiApiKey: env("VAPI_API_KEY"),
  vapiPhoneNumberId: env("VAPI_PHONE_NUMBER_ID"),
  vapiWebhookSecret: env("VAPI_WEBHOOK_SECRET"),
  tts: {
    "en-US": {
      provider: env("TTS_EN_US_PROVIDER", "elevenlabs"),
      voiceId: env("TTS_EN_US_VOICE_ID"),
    },
    "en-IN": {
      provider: env("TTS_EN_IN_PROVIDER", "sarvam"),
      voiceId: env("TTS_EN_IN_VOICE_ID"),
    },
    "hi-IN-hinglish": {
      provider: env("TTS_HINGLISH_PROVIDER", "sarvam"),
      voiceId: env("TTS_HINGLISH_VOICE_ID"),
    },
  },
  sarvam: {
    apiKey: env("SARVAM_API_KEY"),
    model: env("SARVAM_TTS_MODEL", "bulbul:v3"),
    // The Hinglish script is written in masculine Hindi ("kar raha hoon",
    // "bhej deta hoon"), so default to a male voice or the grammar jars.
    speakerHinglish: env("SARVAM_SPEAKER_HINGLISH", "shubh"),
    speakerEnIn: env("SARVAM_SPEAKER_EN_IN", "shubh"),
    // Bulbul takes romanized Hinglish under either code; hi-IN is what
    // Sarvam's own code-mixed examples use. Override to en-IN to compare.
    langHinglish: env("SARVAM_LANG_HINGLISH", "hi-IN"),
  },
  anthropicApiKey: env("ANTHROPIC_API_KEY"),
  anthropicModel: env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
  groqApiKey: env("GROQ_API_KEY"),
  groqModel: env("GROQ_MODEL", "openai/gpt-oss-120b"),
  /** The one file with every line the agent can say. See scripts/call-script.yaml. */
  scriptPath: env("SCRIPT_PATH", "scripts/call-script.yaml"),
  leadsPath: path.resolve(root, env("LEADS_PATH", "data/leads.csv")),
  dncPath: path.resolve(root, env("DNC_PATH", "data/dnc.csv")),
  callsPath: path.resolve(root, env("CALLS_PATH", "data/calls.json")),
  companyId: env("COMPANY_ID", "main-company"),
};
