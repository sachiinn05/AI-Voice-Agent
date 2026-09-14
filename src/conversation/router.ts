import type { CallState, ConversationRoute, Intent } from "../types.js";

const BOOKING_RE =
  /\b(book (me )?(a )?(demo|meeting|call|slot)|schedule (a )?(demo|meeting|call)|lock (it|the slot)|set up a (demo|meeting)|book kar|demo book)\b/i;

const END_INTENTS = new Set<Intent>(["dnc", "hostile", "no_time", "wrong_person"]);
const SLOT_INTENTS = new Set<Intent>(["accept_slot", "decline_slots", "give_availability"]);

export function classifyRoute(intent: Intent, text: string, state?: CallState): ConversationRoute {
  if (END_INTENTS.has(intent)) return "conversation";
  if (intent === "booking_request" || BOOKING_RE.test(text)) return "booking";
  if (state === "CLOSE" && SLOT_INTENTS.has(intent)) return "booking";
  // Only explicit company questions go to RAG. Everything else (acknowledge,
  // objections, small talk) stays on the scripted call flow — otherwise a
  // plain "okay" gets treated as a knowledge lookup and the call never moves.
  if (intent === "company_knowledge") return "knowledge";
  return "conversation";
}
