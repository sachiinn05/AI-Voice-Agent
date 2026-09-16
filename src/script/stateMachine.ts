import { randomUUID } from "node:crypto";
import type { CallState, Intent, KnowledgeSource, Lead, Session, TranscriptTurn } from "../types.js";
import { detectIntent, isContinue, isOffScript } from "./intent.js";
import {
  closeLine,
  confirmSlotLine,
  contextBridge,
  currentScriptQuestion,
  defaultMeetingSlots,
  dncLine,
  fallbackLine,
  holdOnScriptLine,
  noTimeHangupLine,
  nudgeLine,
  openingLine,
  pitchLine,
  silenceHangupLine,
  wrapUpLine,
} from "./lines.js";
import { intentToObjection, rebuttal } from "./objections.js";

const MAX_OBJECTIONS = 3;

function turn(session: Session, role: TranscriptTurn["role"], text: string): TranscriptTurn {
  const entry: TranscriptTurn = {
    role,
    text,
    state: session.state,
    at: new Date().toISOString(),
  };
  session.turns.push(entry);
  return entry;
}

function speak(session: Session, next: CallState, text: string): string {
  session.state = next;
  turn(session, "agent", text);
  return text;
}

function endWith(session: Session, next: CallState, text: string): string {
  const line = speak(session, next, text);
  session.state = "ENDED";
  session.ended = true;
  return line;
}

export function createSession(lead: Lead, callId = randomUUID()): Session {
  return {
    callId,
    lead,
    state: "OPENING",
    turns: [],
    objectionsRaised: [],
    meetingSlot: null,
    complianceFlags: ["ai_disclosed_in_opening"],
    startedAt: Date.now(),
    ended: false,
    silenceNudges: 0,
    knowledgeQuestions: [],
  };
}

/** First spoken beat only. Wait for "okay" before continuing. */
export function startCall(session: Session): string {
  return speak(session, "OPENING", openingLine(session.lead, session.lead.preferred_language));
}

function slots(session: Session): string[] {
  return defaultMeetingSlots(session.lead.preferred_language);
}

const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const HOUR_WORDS: Record<string, string> = { eleven: "11", gyarah: "11", three: "3", teen: "3" };

function hoursIn(text: string): Set<string> {
  const hours = new Set<string>();
  for (const digit of text.match(/\b\d{1,2}\b/g) ?? []) hours.add(digit);
  for (const [word, digit] of Object.entries(HOUR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) hours.add(digit);
  }
  return hours;
}

/**
 * defaultMeetingSlots() picks the next two actual weekdays, so which one is
 * "Monday" vs "Tuesday" shifts by the day the call happens. Match against
 * what was actually offered instead of assuming a fixed first=Monday,
 * second=Tuesday mapping — that assumption silently booked the wrong day
 * whenever the real slots landed on any other weekday pair.
 */
/**
 * Does the caller's reply name one of the slots we just offered (a weekday,
 * an hour, or "first/second")? Used to override the LLM's intent label in
 * CLOSE: in real calls "Wednesday" — the literal second option — was labelled
 * give_availability, so the bot said "I'll send a calendar link" and lost the
 * booking instead of confirming Wednesday.
 */
export function mentionsOfferedSlot(text: string, options: string[]): boolean {
  const lower = text.toLowerCase();
  if (/\b(first|second|pehla|doosra|dusra|pehli|doosri)\b/.test(lower)) return true;
  const saidHours = hoursIn(lower);
  for (const option of options) {
    const day = option.match(WEEKDAY_RE)?.[0]?.toLowerCase();
    if (day && lower.includes(day)) return true;
    if ([...hoursIn(option.toLowerCase())].some((h) => saidHours.has(h))) return true;
  }
  return false;
}

export function pickSlot(text: string, options: string[]): string {
  const lower = text.toLowerCase();
  const saidHours = hoursIn(lower);

  for (const option of options) {
    const day = option.match(WEEKDAY_RE)?.[0]?.toLowerCase();
    if (day && lower.includes(day)) return option;
  }
  for (const option of options) {
    const optionHours = hoursIn(option.toLowerCase());
    if ([...optionHours].some((h) => saidHours.has(h))) return option;
  }

  // Ordinal fallback: "the first one" / "the second one" (also Hinglish).
  if (/\b(second|doosra|dusra)\b/.test(lower) && options[1]) return options[1];
  if (/\b(first|pehla)\b/.test(lower) && options[0]) return options[0];

  return options[0] ?? "the first slot";
}

function handleObjection(session: Session, intent: Intent): string {
  const id = intentToObjection(intent);
  const lang = session.lead.preferred_language;
  const options = slots(session);

  if (id) {
    const already = session.objectionsRaised.includes(id);
    if (!already) session.objectionsRaised.push(id);
    if (already && (id === "not_interested" || id === "who_gave_number")) {
      return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, null));
    }
    if (session.objectionsRaised.length >= MAX_OBJECTIONS && id === "not_interested") {
      return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, null));
    }
    if (id === "no_time") {
      return endWith(session, "WRAP_UP", noTimeHangupLine(session.lead, lang));
    }
    return speak(session, "CLOSE", rebuttal(id, session.lead, lang, options));
  }
  return speak(session, "CLOSE", closeLine(lang, options));
}

function handleClose(session: Session, intent: Intent, text: string): string {
  const lang = session.lead.preferred_language;
  const options = slots(session);

  if (intent === "accept_slot") {
    const picked = pickSlot(text, options);
    session.meetingSlot = picked;
    return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, picked));
  }

  if (intent === "interested" || intent === "acknowledge") {
    const picked = options[0] ?? "Monday 11";
    return speak(session, "CLOSE", confirmSlotLine(lang, picked));
  }

  if (intent === "give_availability" || intent === "decline_slots") {
    session.complianceFlags.push("availability_captured");
    return endWith(
      session,
      "WRAP_UP",
      lang === "hi-IN-hinglish"
        ? "Theek hai, calendar link bhej dunga. Aap jab free ho tab choose kar lena."
        : "All good — I'll send a calendar link and you can pick a time.",
    );
  }

  if (intent === "call_later") return handleObjection(session, "call_later");
  if (intentToObjection(intent)) return handleObjection(session, intent);

  return speak(session, "CLOSE", closeLine(lang, options));
}

export function replyTo(session: Session, prospectText: string, intent?: Intent): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";

  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  const resolved = intent ?? detectIntent(prospectText);
  const lang = session.lead.preferred_language;

  if (resolved === "dnc") {
    session.complianceFlags.push("do_not_call_requested");
    return endWith(session, "WRAP_UP", dncLine(lang));
  }
  if (resolved === "hostile") {
    session.complianceFlags.push("hostile_exit");
    return endWith(session, "FALLBACK", fallbackLine(lang));
  }
  if (isOffScript(resolved)) {
    return speak(
      session,
      session.state,
      holdOnScriptLine(session.lead, lang, session.state),
    );
  }

  if (resolved === "booking_request") {
    return speak(session, "CLOSE", closeLine(lang, slots(session)));
  }

  if (resolved === "wrong_person") {
    return endWith(
      session,
      "WRAP_UP",
      lang === "hi-IN-hinglish"
        ? "Galat number lag raha hai. Main drop karta hoon."
        : "Looks like I have the wrong person. I'll drop off.",
    );
  }

  switch (session.state) {
    case "OPENING":
      if (intentToObjection(resolved)) return handleObjection(session, resolved);
      return speak(session, "CONTEXT_BRIDGE", contextBridge(session.lead, lang));

    case "CONTEXT_BRIDGE":
      if (intentToObjection(resolved)) return handleObjection(session, resolved);
      return speak(session, "PITCH", pitchLine(session.lead, lang));

    case "PITCH":
    case "OBJECTION_HANDLING":
      if (intentToObjection(resolved) && resolved !== "is_this_ai") {
        return handleObjection(session, resolved);
      }
      if (resolved === "is_this_ai") return handleObjection(session, resolved);
      if (isContinue(resolved) || resolved === "accept_slot") {
        return speak(session, "CLOSE", closeLine(lang, slots(session)));
      }
      return handleObjection(session, resolved);

    case "CLOSE":
      return handleClose(session, resolved, prospectText);

    case "WRAP_UP":
    case "FALLBACK":
      session.ended = true;
      session.state = "ENDED";
      return session.turns.at(-1)?.text ?? fallbackLine(lang);

    default:
      return speak(session, "OPENING", openingLine(session.lead, lang));
  }
}

/** Operator ended the call (Hang Up) before the script reached a natural close — say a proper goodbye instead of just going silent. */
export function endCallManually(session: Session): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  return endWith(session, "WRAP_UP", wrapUpLine(session.lead, session.lead.preferred_language, session.meetingSlot));
}

export function nudge(session: Session): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  session.silenceNudges += 1;
  if (session.silenceNudges >= 2) {
    session.complianceFlags.push("silence_hangup");
    return endWith(session, "WRAP_UP", silenceHangupLine(session.lead.preferred_language));
  }
  return speak(
    session,
    session.state,
    nudgeLine(session.lead, session.lead.preferred_language),
  );
}

export function scriptQuestionFor(session: Session): string {
  return currentScriptQuestion(session.lead, session.lead.preferred_language, session.state);
}

/** Knowledge reply that also moves the script forward (used after "okay"). */
export function advanceWithReply(
  session: Session,
  prospectText: string,
  agentText: string,
  next: CallState,
  extras: { via?: TranscriptTurn["via"]; sources?: KnowledgeSource[] } = {},
): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  session.state = next;
  const entry: TranscriptTurn = {
    role: "agent",
    text: agentText,
    state: next,
    at: new Date().toISOString(),
    via: extras.via ?? "rag",
    sources: extras.sources,
  };
  session.turns.push(entry);
  return agentText;
}

/** Knowledge / RAG reply: keep the current script beat, do not advance state. */
export function recordSideReply(
  session: Session,
  prospectText: string,
  agentText: string,
  extras: { via?: TranscriptTurn["via"]; sources?: KnowledgeSource[] } = {},
): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  const entry: TranscriptTurn = {
    role: "agent",
    text: agentText,
    state: session.state,
    at: new Date().toISOString(),
    via: extras.via ?? "rag",
    sources: extras.sources,
  };
  session.turns.push(entry);
  return agentText;
}

/** Caller asked to book before the script reached CLOSE. */
export function offerBooking(session: Session, prospectText: string): string {
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  return speak(session, "CLOSE", closeLine(session.lead.preferred_language, slots(session)));
}

export function replaceLastAgentLine(session: Session, text: string): void {
  for (let i = session.turns.length - 1; i >= 0; i -= 1) {
    const entry = session.turns[i];
    if (entry?.role === "agent") {
      entry.text = text;
      return;
    }
  }
}

export function transcriptText(session: Session): string {
  return session.turns
    .map((t) => `${t.role === "agent" ? "Agent" : "Prospect"}: ${t.text}`)
    .join("\n");
}
