import type { PreferredLanguage } from "../types.js";
import { routeVoice } from "./routing.js";

export type Agent = {
  id: string;
  language: PreferredLanguage;
  name: string;
  tagline: string;
  description: string;
  flag: string;
};

/**
 * The three callable personas. Each is just a language lock (see
 * routeVoice) — same script, same brain, different voice and locale. Picking
 * an agent in the UI filters the lead list to that language so a call is
 * never a mismatched pairing (a US-English voice reading a Hinglish lead).
 */
export const AGENTS: Agent[] = [
  {
    id: "hinglish",
    language: "hi-IN-hinglish",
    name: "Hinglish Agent",
    tagline: "Hindi + English, the way Indian callers actually speak",
    description: "Natural code-mixed Hinglish — \"haan bilkul\", \"thoda time hai\". Best for Indian leads.",
    flag: "🇮🇳",
  },
  {
    id: "indian-english",
    language: "en-IN",
    name: "Indian English Agent",
    tagline: "Indian-accented English",
    description: "Clear Indian-English phrasing for leads who'd rather not mix in Hindi.",
    flag: "🇮🇳",
  },
  {
    id: "us-english",
    language: "en-US",
    name: "US English Agent",
    tagline: "American English",
    description: "Straightforward US-English delivery for leads based in the US.",
    flag: "🇺🇸",
  },
];

export function agentsWithVoice() {
  return AGENTS.map((agent) => ({ ...agent, voice: routeVoice(agent.language) }));
}
