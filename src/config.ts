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
  anthropicApiKey: env("ANTHROPIC_API_KEY"),
  anthropicModel: env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
  groqApiKey: env("GROQ_API_KEY"),
  groqModel: env("GROQ_MODEL", "openai/gpt-oss-120b"),
  leadsPath: path.resolve(root, env("LEADS_PATH", "data/leads.csv")),
  dncPath: path.resolve(root, env("DNC_PATH", "data/dnc.csv")),
  callsPath: path.resolve(root, env("CALLS_PATH", "data/calls.json")),
  questionsPath: path.resolve(root, env("QUESTIONS_PATH", "data/questions.json")),
  knowledgeDir: path.resolve(root, env("KNOWLEDGE_DIR", "knowledge")),
  companyId: env("COMPANY_ID", "main-company"),
  mongoUri: env("MONGODB_URI"),
  mongoDbName: env("MONGODB_DB", "lipi"),
  vectorIndexName: env("VECTOR_INDEX_NAME", "knowledge_vector_index"),
  embedding: {
    provider: env("EMBEDDING_PROVIDER", "openai"),
    apiKey: env("EMBEDDING_API_KEY") || env("OPENAI_API_KEY"),
    model: env("EMBEDDING_MODEL", "text-embedding-3-small"),
    baseUrl: env("EMBEDDING_BASE_URL", "https://api.openai.com/v1"),
    dimensions: Number(env("EMBEDDING_DIMENSIONS", "0")) || 0,
  },
  rag: {
    topK: Number(env("RAG_TOP_K", "5")) || 5,
    minScore: Number(env("RAG_MIN_SCORE", "0")) || 0,
  },
};
