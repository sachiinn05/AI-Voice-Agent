/**
 * Objection rebuttals, read from the `objections:` section of
 * scripts/call-script.yaml. The technique notes live there next to the lines.
 */
import type { Intent, Lead, PreferredLanguage } from "../types.js";
import { baseVars, closeLine, slotPair } from "./lines.js";
import { getScript, render, scriptLang } from "./scriptFile.js";

export type ObjectionId =
  | "not_interested"
  | "already_use_competitor"
  | "send_email"
  | "how_much"
  | "is_this_ai"
  | "no_time"
  | "who_gave_number"
  | "call_later"
  | "not_decision_maker"
  | "need_to_think"
  | "bad_past_experience";

export const OBJECTION_MAP: Record<ObjectionId, { intent: Intent; label: string }> = {
  not_interested: { intent: "not_interested", label: "not interested" },
  already_use_competitor: {
    intent: "already_use_competitor",
    label: "we already use a competitor",
  },
  send_email: { intent: "send_email", label: "just send me an email" },
  how_much: { intent: "how_much", label: "how much does this cost" },
  is_this_ai: { intent: "is_this_ai", label: "is this actually AI" },
  no_time: { intent: "no_time", label: "I don't have time right now" },
  who_gave_number: { intent: "who_gave_number", label: "who gave you this number" },
  call_later: { intent: "call_later", label: "call me later" },
  not_decision_maker: { intent: "not_decision_maker", label: "I'm not the one who decides this" },
  need_to_think: { intent: "need_to_think", label: "let me think about it" },
  bad_past_experience: { intent: "bad_past_experience", label: "we tried something like this before" },
};

export function rebuttal(
  id: ObjectionId,
  lead: Lead,
  language: PreferredLanguage,
  slots: string[],
): string {
  const l = scriptLang(language);
  return render(getScript().objections[id][l], {
    ...baseVars(lead, language),
    slots: slotPair(language, slots),
    close: closeLine(language, slots),
  });
}

export function intentToObjection(intent: Intent): ObjectionId | null {
  for (const [id, meta] of Object.entries(OBJECTION_MAP)) {
    if (meta.intent === intent) return id as ObjectionId;
  }
  return null;
}
