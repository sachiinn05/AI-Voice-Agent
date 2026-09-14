import { config } from "../config.js";
import type { CallResult, Disposition, NextAction, Session } from "../types.js";
import { CallResultSchema } from "../types.js";
import { transcriptText } from "../script/stateMachine.js";

function heuristicScore(session: Session): CallResult {
  const flags = session.complianceFlags;
  const objections = session.objectionsRaised;
  const connected = session.turns.some((t) => t.role === "prospect");
  let disposition: Disposition = "Not Interested";
  let next_action: NextAction = "mark_dead";
  let lead_score = 2;

  if (flags.includes("do_not_call_requested")) {
    disposition = "Do-Not-Call Requested";
    next_action = "mark_dead";
    lead_score = 1;
  } else if (session.meetingSlot) {
    disposition = "Meeting Booked";
    next_action = "nothing";
    lead_score = 5;
  } else if (flags.includes("hostile_exit")) {
    disposition = "Not Interested";
    next_action = "human_callback";
    lead_score = 1;
  } else if (flags.includes("availability_captured") || objections.includes("call_later")) {
    disposition = objections.includes("call_later")
      ? "Call Back Requested"
      : "Interested-Follow-up";
    next_action = objections.includes("call_later") ? "retry_call" : "send_follow_up_email";
    lead_score = 4;
  } else if (objections.includes("send_email")) {
    disposition = "Interested-Follow-up";
    next_action = "send_follow_up_email";
    lead_score = 3;
  } else if (!connected) {
    disposition = "No Answer";
    next_action = "retry_call";
    lead_score = 1;
  }

  const quotes = session.turns
    .filter((t) => t.role === "prospect")
    .map((t) => t.text)
    .filter((t) => t.length > 8)
    .slice(0, 2);

  const [date, ...rest] = (session.meetingSlot ?? "").split(" at ");

  return CallResultSchema.parse({
    call_id: session.callId,
    timestamp: new Date().toISOString(),
    duration: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
    connected,
    full_transcript: transcriptText(session),
    call_summary: session.meetingSlot
      ? `Prospect at ${session.lead.company_name} booked ${session.meetingSlot}.`
      : `Call with ${session.lead.contact_name} at ${session.lead.company_name} ended as ${disposition}.`,
    disposition,
    lead_score,
    objections_raised: objections,
    key_quotes: quotes,
    meeting_details: session.meetingSlot
      ? {
          date: date || session.meetingSlot,
          time: rest.join(" at ") || session.meetingSlot,
          with: config.founderName,
          calendly_url: config.calBookingUrl || undefined,
        }
      : null,
    company_details_confirmed: [],
    compliance_flags: flags,
    next_action,
    lead: session.lead,
    knowledge_questions: session.knowledgeQuestions,
  });
}

export async function scoreCall(session: Session): Promise<CallResult> {
  const fallback = heuristicScore(session);
  if (!config.anthropicApiKey) return fallback;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Score this outbound sales call. Return JSON only matching this schema:
call_summary (2-3 sentences), disposition (one of: Meeting Booked, Interested-Follow-up, Not Interested, Wrong Number, Voicemail, Gatekeeper-Blocked, No Answer, Call Back Requested, Do-Not-Call Requested), lead_score (1-5), objections_raised (string[]), key_quotes (string[] max 2), company_details_confirmed (string[]), next_action (nothing | send_follow_up_email | retry_call | mark_dead | human_callback).

Transcript:
${fallback.full_transcript}`,
          },
        ],
      }),
    });

    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.[0]?.text ?? "";
    const json = JSON.parse(text.replace(/^```json\n?|```$/g, "").trim()) as Partial<CallResult>;
    return CallResultSchema.parse({
      ...fallback,
      ...json,
      call_id: fallback.call_id,
      timestamp: fallback.timestamp,
      duration: fallback.duration,
      full_transcript: fallback.full_transcript,
      lead: session.lead,
    });
  } catch {
    return fallback;
  }
}
