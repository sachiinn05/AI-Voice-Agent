import { z } from "zod";

/** Preferred language is chosen BEFORE the call. Mid-call voice switch is V2+. */
export const PreferredLanguageSchema = z.enum([
  "en-US",
  "en-IN",
  "hi-IN-hinglish",
]);
export type PreferredLanguage = z.infer<typeof PreferredLanguageSchema>;

export const PriorityTierSchema = z.enum(["human", "high", "normal"]).optional();

/** Doc 9 input schema — what the bot needs before it dials. */
export const LeadSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().min(1),
  contact_number: z.string().min(1),
  contact_role: z.string().default(""),
  company_domain: z.string().default(""),
  company_description: z.string().min(1),
  industry: z.string().min(1),
  need_for_bot: z.string().default(""),
  preferred_language: PreferredLanguageSchema.default("en-IN"),
  lead_source: z.string().default(""),
  priority_tier: z.enum(["human", "high", "normal"]).default("normal"),
  // Only affects Hindi grammatical agreement when the script addresses the
  // caller directly ("rahe" vs "rahi"). Defaults to the script's existing
  // wording so a lead row without this column behaves exactly as before.
  gender: z.enum(["male", "female"]).default("male"),
});
export type Lead = z.infer<typeof LeadSchema>;

export const DispositionSchema = z.enum([
  "Meeting Booked",
  "Interested-Follow-up",
  "Not Interested",
  "Wrong Number",
  "Voicemail",
  "Gatekeeper-Blocked",
  "No Answer",
  "Call Back Requested",
  "Do-Not-Call Requested",
]);
export type Disposition = z.infer<typeof DispositionSchema>;

export const NextActionSchema = z.enum([
  "nothing",
  "send_follow_up_email",
  "retry_call",
  "mark_dead",
  "human_callback",
]);
export type NextAction = z.infer<typeof NextActionSchema>;

/** A question the caller asked mid-call, and which script FAQ entry (if any) answered it. */
export const QuestionAskedSchema = z.object({
  question: z.string(),
  faqId: z.string().nullable(),
  at: z.string(),
});
export type QuestionAsked = z.infer<typeof QuestionAskedSchema>;

/** Doc 9 output schema — identical shape to collections dispo, different vocabulary. */
export const CallResultSchema = z.object({
  call_id: z.string(),
  timestamp: z.string(),
  duration: z.number().int().nonnegative(),
  connected: z.boolean(),
  full_transcript: z.string(),
  call_summary: z.string(),
  disposition: DispositionSchema,
  lead_score: z.number().min(1).max(5),
  objections_raised: z.array(z.string()),
  key_quotes: z.array(z.string()),
  meeting_details: z
    .object({
      date: z.string(),
      time: z.string(),
      with: z.string(),
      calendly_url: z.string().optional(),
    })
    .nullable(),
  company_details_confirmed: z.array(z.string()),
  compliance_flags: z.array(z.string()),
  next_action: NextActionSchema,
  lead: LeadSchema.optional(),
  questions_asked: z.array(QuestionAskedSchema).optional(),
});
export type CallResult = z.infer<typeof CallResultSchema>;

export const CallStateSchema = z.enum([
  "OPENING",
  "CONTEXT_BRIDGE",
  "PITCH",
  "OBJECTION_HANDLING",
  "CLOSE",
  "WRAP_UP",
  "FALLBACK",
  "ENDED",
]);
export type CallState = z.infer<typeof CallStateSchema>;

export const IntentSchema = z.enum([
  "acknowledge",
  "interested",
  "not_interested",
  "already_use_competitor",
  "send_email",
  "how_much",
  "is_this_ai",
  "no_time",
  "who_gave_number",
  "call_later",
  "not_decision_maker",
  "need_to_think",
  "bad_past_experience",
  "hostile",
  "wrong_person",
  "voicemail",
  "gatekeeper",
  "accept_slot",
  "decline_slots",
  "give_availability",
  "dnc",
  "company_knowledge",
  "booking_request",
  "unclear",
]);
export type Intent = z.infer<typeof IntentSchema>;

export type TranscriptTurn = {
  role: "agent" | "prospect";
  text: string;
  state: CallState;
  at: string;
  via?: "script" | "groq" | "steer" | "faq";
};

export type Session = {
  callId: string;
  lead: Lead;
  state: CallState;
  turns: TranscriptTurn[];
  objectionsRaised: string[];
  meetingSlot: string | null;
  complianceFlags: string[];
  startedAt: number;
  ended: boolean;
  silenceNudges: number;
  questionsAsked: QuestionAsked[];
};

export type ConversationRoute = "knowledge" | "booking" | "conversation";
