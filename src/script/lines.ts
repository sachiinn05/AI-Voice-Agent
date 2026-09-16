/**
 * Every spoken line, read from scripts/call-script.yaml. Nothing here is
 * hardcoded text — these functions pick the right beat for the moment and
 * fill in the caller's details. Edit the YAML to change what the agent says.
 */
import type { Lead, PreferredLanguage } from "../types.js";
import { config } from "../config.js";
import { getScript, render, scriptLang, type ScriptLang, type Vars } from "./scriptFile.js";

export function firstName(lead: Lead): string {
  return lead.contact_name.trim().split(/\s+/)[0] ?? lead.contact_name;
}

function founder(): string {
  return config.founderName || "Sachin";
}

function company(): string {
  return config.companyName || "our company";
}

// ---------------------------------------------------------------------------
// Topic: which story this lead gets
// ---------------------------------------------------------------------------

export type Topic = {
  key: string;
  /** Short noun phrase for splicing into a sentence, e.g. "patient calls". */
  noun: string;
  nounHi: string;
  /** Fuller phrase for a standalone question/sentence. */
  full: string;
  fullHi: string;
  /** What it costs them when the call goes unanswered — sells the outcome, not the feature. */
  consequence: string;
  consequenceHi: string;
};

/** Maps a lead's industry/description to the topic in the script whose `match` words appear. */
export function topicFor(lead: Lead): Topic {
  const blob = `${lead.industry} ${lead.company_description} ${lead.need_for_bot}`.toLowerCase();
  const { topics } = getScript();
  let key = "general";
  for (const [name, topic] of Object.entries(topics)) {
    if (name === "general") continue;
    if (topic.match.some((word) => word && blob.includes(word.toLowerCase()))) {
      key = name;
      break;
    }
  }
  const t = topics[key] ?? topics["general"]!;
  return {
    key,
    noun: t.en.calls,
    nounHi: t.hi.calls,
    full: t.en.problem,
    fullHi: t.hi.problem,
    consequence: t.en.consequence,
    consequenceHi: t.hi.consequence,
  };
}

// ---------------------------------------------------------------------------
// Placeholder values for a given call
// ---------------------------------------------------------------------------

function baseVars(lead: Lead, language: PreferredLanguage): Vars {
  const t = topicFor(lead);
  const l = scriptLang(language);
  return {
    name: firstName(lead),
    company: lead.company_name,
    ourCompany: company(),
    founder: founder(),
    calls: l === "hi" ? t.nounHi : t.noun,
    problem: l === "hi" ? t.fullHi : t.full,
    consequence: l === "hi" ? t.consequenceHi : t.consequence,
  };
}

function say(line: { en: string; hi: string }, l: ScriptLang, vars: Vars): string {
  return render(line[l], vars);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export function defaultMeetingSlots(language: PreferredLanguage = "en-IN"): string[] {
  if (config.meetingSlots.length >= 2) return config.meetingSlots;
  const out: string[] = [];
  const cursor = new Date();
  const hours = [11, 15];
  while (out.length < 2) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    const hour = hours[out.length] ?? 11;
    const weekday = cursor.toLocaleDateString("en-IN", { weekday: "long" });
    if (scriptLang(language) === "hi") {
      out.push(`${weekday} ${hour === 11 ? "11 baje" : "3 baje"}`);
    } else {
      out.push(`${weekday} at ${hour === 11 ? "11" : "3"}`);
    }
  }
  return out;
}

export function slotPair(language: PreferredLanguage, slots: string[]): string {
  const a = slots[0] ?? "Monday 11";
  const b = slots[1] ?? "Tuesday 3";
  return scriptLang(language) === "hi" ? `${a} ya ${b}` : `${a} or ${b}`;
}

// ---------------------------------------------------------------------------
// The call, beat by beat
// ---------------------------------------------------------------------------

/** Short backchannels spoken the instant the caller stops talking, while the real reply is generated. */
export function thinkingFillers(language: PreferredLanguage): string[] {
  const f = getScript().steering.fillers;
  if (language === "hi-IN-hinglish") return f.hi;
  if (language === "en-IN") return f["en-IN"];
  return f["en-US"];
}

/** Outbound cold-open: say who's calling and why, then ask for a minute. Nothing else. */
export function openingLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.opening, scriptLang(language), baseVars(lead, language));
}

/** The discovery question this call is actually built around. Lead-specific, not a menu. */
export function problemQuestion(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.discovery_question, scriptLang(language), baseVars(lead, language));
}

/** Company intro beat: thank them for the minute, ask the one discovery question. */
export function contextBridge(lead: Lead, language: PreferredLanguage): string {
  const vars = { ...baseVars(lead, language), question: problemQuestion(lead, language) };
  return say(getScript().flow.discovery, scriptLang(language), vars);
}

/** Acknowledge, sell the outcome (not just the feature), ask for a demo. Then wait. */
export function pitchLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.pitch, scriptLang(language), baseVars(lead, language));
}

/** Two concrete times, and what they're for. */
export function closeLine(language: PreferredLanguage, slots: string[]): string {
  return say(getScript().flow.close, scriptLang(language), {
    founder: founder(),
    slots: slotPair(language, slots),
  });
}

export function confirmSlotLine(language: PreferredLanguage, slot: string): string {
  return say(getScript().flow.confirm_slot, scriptLang(language), { slot });
}

export function wrapUpLine(lead: Lead, language: PreferredLanguage, booked: string | null): string {
  const s = getScript().flow;
  const vars = { ...baseVars(lead, language), slot: booked ?? "" };
  return say(booked ? s.wrap_up_booked : s.wrap_up_not_booked, scriptLang(language), vars);
}

export function availabilityCapturedLine(language: PreferredLanguage): string {
  return say(getScript().flow.availability_captured, scriptLang(language), {});
}

// ---------------------------------------------------------------------------
// Exits — spoken exactly as written, never rephrased
// ---------------------------------------------------------------------------

export function noTimeHangupLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.no_time, scriptLang(language), baseVars(lead, language));
}

export function fallbackLine(language: PreferredLanguage): string {
  return say(getScript().exits.hostile, scriptLang(language), {});
}

export function dncLine(language: PreferredLanguage): string {
  return say(getScript().exits.do_not_call, scriptLang(language), {});
}

export function wrongPersonLine(language: PreferredLanguage): string {
  return say(getScript().exits.wrong_person, scriptLang(language), {});
}

export function silenceHangupLine(language: PreferredLanguage): string {
  return say(getScript().exits.silence, scriptLang(language), {});
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

export function nudgeLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().steering.nudge, scriptLang(language), baseVars(lead, language));
}

/** The question we're steering back to, for the beat the call is on. */
export function currentScriptQuestion(lead: Lead, language: PreferredLanguage, state: string): string {
  const s = getScript();
  const l = scriptLang(language);
  if (state === "OPENING") return say(s.steering.anchor.opening, l, {});
  if (state === "CONTEXT_BRIDGE") return problemQuestion(lead, language);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") return say(s.flow.pitch_question, l, {});
  if (state === "CLOSE") return closeLine(language, defaultMeetingSlots(language));
  return say(s.steering.anchor.default, l, {});
}

export function holdOnScriptLine(lead: Lead, language: PreferredLanguage, state: string): string {
  const question = currentScriptQuestion(lead, language, state);
  return say(getScript().steering.hold_on_script, scriptLang(language), { question });
}

/** A question the FAQ doesn't cover: say so, don't guess, pivot to the demo. */
export function faqNoMatchLine(language: PreferredLanguage): string {
  return say(getScript().steering.faq_no_match, scriptLang(language), { founder: founder() });
}
