import type { CallState, ConversationRoute, Intent } from "../types.js";

const BOOKING_RE =
  /\b(book (me )?(a )?(demo|meeting|call|slot)|schedule (a )?(demo|meeting|call)|lock (it|the slot)|set up a (demo|meeting)|book kar|demo book)\b/i;

const END_INTENTS = new Set<Intent>(["dnc", "hostile", "no_time", "wrong_person"]);
const SLOT_INTENTS = new Set<Intent>(["accept_slot", "decline_slots", "give_availability"]);

// English + Hinglish question markers. A "?" from the typed box counts too.
const QUESTION_RE =
  /\?|\b(what|how|when|where|which|who|why|whom|do you|does|can you|could you|is it|is there|are you|are there|tell me|kya|kaise|kaisa|kitna|kitne|kitni|kab|kahan|kaun|kyun|kyon|batao|bataiye|bata do|hai kya|hoga kya|milega)\b/i;

/** True when the caller is asking something, as opposed to describing/answering. */
export function looksLikeQuestion(text: string): boolean {
  return QUESTION_RE.test(text);
}

// Intents under which a question-shaped utterance should be tried against
// the FAQ. Objections (how_much, is_this_ai…) are deliberately NOT here: the
// script's objection lines already answer those and drive to the close.
// Exits/booking/slot intents aren't either — those have to win outright.
const FAQ_INTENTS = new Set<Intent>(["company_knowledge", "unclear", "acknowledge", "interested", "gatekeeper", "voicemail"]);

/**
 * Should this turn be tried against the script FAQ first? The LLM often
 * labels a real question as `unclear` ("hindi mein baat karega?") — the
 * shape of the text is a better signal than the label.
 */
export function wantsFaq(intent: Intent, text: string): boolean {
  return FAQ_INTENTS.has(intent) && looksLikeQuestion(text) && !BOOKING_RE.test(text);
}

export function classifyRoute(intent: Intent, text: string, state?: CallState): ConversationRoute {
  if (END_INTENTS.has(intent)) return "conversation";
  if (intent === "booking_request" || BOOKING_RE.test(text)) return "booking";
  if (state === "CLOSE" && SLOT_INTENTS.has(intent)) return "booking";
  // Only an actual company QUESTION goes to RAG. Groq labels most free-form
  // statements company_knowledge too — including the caller simply answering
  // our discovery question ("we call them back in the morning"). Sending
  // those to RAG produced non-sequiturs from random PDF chunks in real
  // calls. A statement stays on the script, where the next beat already
  // opens with "Got it…" and acknowledges whatever they said.
  if (intent === "company_knowledge" && looksLikeQuestion(text)) return "knowledge";
  return "conversation";
}
