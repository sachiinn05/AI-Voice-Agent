/**
 * Objection rebuttals, read from the `objections:` section of
 * scripts/call-script.yaml. The technique notes live there next to the lines.
 */
import { config } from "../config.js";
import type { Intent, Lead, PreferredLanguage } from "../types.js";
import { closeLine, firstName, slotPair, topicFor } from "./lines.js";
import { getScript, render, scriptLang } from "./scriptFile.js";

export type ObjectionId =
  | "not_interested"
  | "already_use_competitor"
  | "send_email"
  | "how_much"
  | "is_this_ai"
  | "no_time"
  | "who_gave_number"
  | "call_later";

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
};

export function rebuttal(
  id: ObjectionId,
  lead: Lead,
  language: PreferredLanguage,
  slots: string[],
): string {
  const l = scriptLang(language);
  const t = topicFor(lead);
  return render(getScript().objections[id][l], {
    name: firstName(lead),
    company: lead.company_name,
    ourCompany: config.companyName || "our company",
    founder: config.founderName || "Sachin",
    calls: l === "hi" ? t.nounHi : t.noun,
    problem: l === "hi" ? t.fullHi : t.full,
    consequence: l === "hi" ? t.consequenceHi : t.consequence,
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
