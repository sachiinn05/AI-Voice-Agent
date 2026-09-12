import { config } from "../config.js";
import type { PreferredLanguage } from "../types.js";

/**
 * Doc 9: no single vendor is excellent at all three accents.
 * Route TTS by preferred_language BEFORE the call starts.
 */
export const VOICE_VENDORS = {
  usEnglish: ["elevenlabs", "cartesia"],
  indianEnglishAndHinglish: ["sarvam", "smallest"],
} as const;

export function routeVoice(language: PreferredLanguage) {
  const route = config.tts[language];
  const reason =
    language === "en-US"
      ? "ElevenLabs / Cartesia lead on natural US English"
      : "Sarvam Bulbul / Smallest.ai lead on Indian-English and Hinglish";

  return {
    language,
    provider: route.provider,
    voiceId: route.voiceId || null,
    switchMidCall: false,
    note: `${reason}. Mid-call voice switching is out of V1 scope.`,
  };
}

export function describeRouting(): string {
  return [
    "en-US            → ElevenLabs or Cartesia (US-English)",
    "en-IN            → Sarvam Bulbul or Smallest.ai (Indian-English)",
    "hi-IN-hinglish   → Sarvam Bulbul or Smallest.ai (Hinglish)",
    "Language is locked from the lead record before dial. Do not detect/switch mid-call in V1.",
  ].join("\n");
}
