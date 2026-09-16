import { classifyRoute, wantsFaq } from "./router.js";
import { classifyIntent, naturalizeReply, steerBackToScript } from "../llm/groq.js";
import { answerFromScript, type FaqMatch } from "../script/faq.js";
import { isOffScript } from "../script/intent.js";
import { defaultMeetingSlots, faqNoMatchLine } from "../script/lines.js";
import {
  mentionsOfferedSlot,
  offerBooking,
  recordSideReply,
  replaceLastAgentLine,
  replyTo,
} from "../script/stateMachine.js";
import type { ConversationRoute, Intent, Session } from "../types.js";

// "Sorry, what?" / "dobara bolo" / "what did you just say" — re-say the last
// line instead of classifying it as a new intent. A real call had the caller
// ask exactly this and get a not-interested rebuttal back.
const REPEAT_RE =
  /\b(repeat|say (that|it) again|come again|pardon|didn'?t (catch|hear|get) (that|it)|what did you (just )?say|dobara (bolo|boliye|bolna)|phir se (bolo|boliye|bolna)|(pichhla|pichla|last) (sentence|line|baat)|samajh nahi aaya|sunai nahi diya|kya bola|kya kaha)\b/i;

export type TurnResult = {
  agent: string;
  via: "script" | "groq" | "steer" | "faq";
  intent: Intent;
  route: ConversationRoute;
  /** Which FAQ entry answered, when one did. */
  faqId: string | null;
  ended: boolean;
};

/**
 * Caller asked a question. Answer it from the script's FAQ, verbatim, without
 * moving the call off its current beat — then the flow resumes. Not covered
 * → say so and pivot to the demo. Never invent.
 */
function speakAnswer(session: Session, text: string, intent: Intent, match: FaqMatch | null): TurnResult {
  const answer = match?.answer ?? faqNoMatchLine(session.lead.preferred_language);
  const agent = recordSideReply(session, text, answer, { via: match ? "faq" : "script" });
  session.questionsAsked.push({ question: text, faqId: match?.id ?? null, at: new Date().toISOString() });
  return {
    agent,
    via: match ? "faq" : "script",
    intent,
    route: "knowledge",
    faqId: match?.id ?? null,
    ended: false,
  };
}

/** Concrete facts a natural rephrase must not lose — a booked slot, or the slots on offer. */
function factsToPreserve(session: Session): string[] {
  if (session.meetingSlot) return [session.meetingSlot];
  if (session.state === "CLOSE") return defaultMeetingSlots(session.lead.preferred_language);
  return [];
}

export async function handleTurn(session: Session, text: string): Promise<TurnResult> {
  // Caller asked us to repeat ourselves: replay the last line, don't advance.
  const lastAgent = [...session.turns].reverse().find((t) => t.role === "agent");
  if (!session.ended && lastAgent && REPEAT_RE.test(text) && text.trim().split(/\s+/).length <= 10) {
    const again = recordSideReply(session, text, lastAgent.text, { via: "script" });
    return { agent: again, via: "script", intent: "unclear", route: "conversation", faqId: null, ended: false };
  }

  let intent = await classifyIntent(session, text);

  // In CLOSE, naming one of the slots we just offered IS accepting it —
  // regardless of what label the LLM picked. Overrides give_availability /
  // acknowledge / unclear for "Wednesday", "11", "the second one", etc.
  if (session.state === "CLOSE" && mentionsOfferedSlot(text, defaultMeetingSlots(session.lead.preferred_language))) {
    intent = "accept_slot";
  }

  // A question gets tried against the script FAQ first, whatever label the
  // LLM gave it. A hit is spoken verbatim and the call stays on its beat.
  // No hit: an explicit company question gets the honest "don't know →
  // demo" pivot; anything else falls through to the normal flow, so a
  // "hello, are you there?" is handled as off-script, not as a lookup.
  if (!session.ended && wantsFaq(intent, text)) {
    const match = await answerFromScript(text, session.lead, session.lead.preferred_language);
    if (match || intent === "company_knowledge") return speakAnswer(session, text, intent, match);
  }

  const route = classifyRoute(intent, text, session.state);

  if (route === "booking" && !session.ended && session.state !== "CLOSE" && session.state !== "WRAP_UP") {
    return {
      agent: offerBooking(session, text),
      via: "script",
      intent,
      route,
      faqId: null,
      ended: session.ended,
    };
  }

  const agent = replyTo(session, text, intent);

  if (!session.ended) {
    // Caller went off-script (unclear / voicemail / gatekeeper): instead of
    // bluntly repeating the script question, let Groq craft one short
    // natural acknowledgment that still lands on the same question.
    if (isOffScript(intent)) {
      const natural = await steerBackToScript(session, text, agent);
      if (natural && natural !== agent) {
        replaceLastAgentLine(session, natural);
        return { agent: natural, via: "steer", intent, route, faqId: null, ended: session.ended };
      }
    } else {
      // On-script: the facts are locked (see factsToPreserve), but let Groq
      // say the line the way a real rep would — reacting to what was just
      // said — instead of repeating the identical sentence every time the
      // call lands on the same beat. Falls back to the scripted line
      // whenever Groq is off, fails, or drops a fact it must keep exact
      // (a compliance-sensitive exit like WRAP_UP/DNC is skipped entirely,
      // since session.ended is already true by the time it's spoken).
      const natural = await naturalizeReply(session, text, agent, factsToPreserve(session));
      if (natural && natural !== agent) {
        replaceLastAgentLine(session, natural);
        return { agent: natural, via: "steer", intent, route, faqId: null, ended: session.ended };
      }
    }
  }

  return {
    agent,
    via: "script",
    intent,
    route,
    faqId: null,
    ended: session.ended,
  };
}
