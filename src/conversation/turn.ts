import { randomUUID } from "node:crypto";
import { classifyRoute } from "./router.js";
import { saveQuestion } from "../leads/questions.js";
import { classifyIntent, naturalizeReply, steerBackToScript } from "../llm/groq.js";
import { answerCompanyQuestion } from "../rag/service.js";
import { isOffScript } from "../script/intent.js";
import { defaultMeetingSlots } from "../script/lines.js";
import { offerBooking, recordSideReply, replaceLastAgentLine, replyTo } from "../script/stateMachine.js";
import type { ConversationRoute, Intent, KnowledgeSource, Session } from "../types.js";

export type TurnResult = {
  agent: string;
  via: "script" | "groq" | "steer" | "rag";
  intent: Intent;
  route: ConversationRoute;
  sources: KnowledgeSource[];
  ended: boolean;
};

async function speakKnowledge(
  session: Session,
  text: string,
  rag: Awaited<ReturnType<typeof answerCompanyQuestion>>,
  intent: Intent,
): Promise<TurnResult> {
  const agent = recordSideReply(session, text, rag.answer, {
    via: "rag",
    sources: rag.sources,
  });
  const saved = await saveQuestion({
    id: randomUUID(),
    callId: session.callId,
    contactName: session.lead.contact_name,
    question: text,
    answer: rag.answer,
    sources: rag.sources,
    grounded: rag.grounded,
  });
  session.knowledgeQuestions.push(saved);
  return {
    agent,
    via: "rag",
    intent,
    route: "knowledge",
    sources: rag.sources,
    ended: false,
  };
}

function knowledgeQuery(session: Session, text: string): string {
  // Guard against a stray short/ambiguous utterance landing on this route —
  // search something useful instead of the literal one or two words.
  if (text.trim().split(/\s+/).length <= 2) {
    return session.state === "OPENING"
      ? "What does the company do, and who does it help? Answer in one or two short spoken sentences."
      : "What products, plans, or policies should a caller know? Answer in one or two short spoken sentences.";
  }
  return text;
}

/** Concrete facts a natural rephrase must not lose — a booked slot, or the slots on offer. */
function factsToPreserve(session: Session): string[] {
  if (session.meetingSlot) return [session.meetingSlot];
  if (session.state === "CLOSE") return defaultMeetingSlots(session.lead.preferred_language);
  return [];
}

export async function handleTurn(session: Session, text: string): Promise<TurnResult> {
  const intent = await classifyIntent(session, text);
  const route = classifyRoute(intent, text, session.state);

  if (route === "knowledge" && !session.ended) {
    const rag = await answerCompanyQuestion({
      question: knowledgeQuery(session, text),
      language: session.lead.preferred_language,
    });
    return speakKnowledge(session, text, rag, intent);
  }

  if (route === "booking" && !session.ended && session.state !== "CLOSE" && session.state !== "WRAP_UP") {
    return {
      agent: offerBooking(session, text),
      via: "script",
      intent,
      route,
      sources: [],
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
        return { agent: natural, via: "steer", intent, route, sources: [], ended: session.ended };
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
        return { agent: natural, via: "steer", intent, route, sources: [], ended: session.ended };
      }
    }
  }

  return {
    agent,
    via: "script",
    intent,
    route,
    sources: [],
    ended: session.ended,
  };
}
