/**
 * Loads scripts/call-script.yaml — the single source of every line the agent
 * can say — and validates it hard at startup. A missing beat, a bad language
 * key, or an unknown {placeholder} throws here, so the failure is a stack
 * trace on `npm run dev`, never a broken sentence in a live call.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { config } from "../config.js";
import type { PreferredLanguage } from "../types.js";

const Line = z.object({ en: z.string().trim().min(1), hi: z.string().trim().min(1) });
const TopicText = z.object({
  calls: z.string().trim().min(1),
  problem: z.string().trim().min(1),
  consequence: z.string().trim().min(1),
});
const Topic = z.object({ match: z.array(z.string()), en: TopicText, hi: TopicText });

export const ScriptSchema = z.object({
  topics: z.record(z.string(), Topic).refine((t) => "general" in t, {
    message: 'topics must include a "general" fallback',
  }),
  flow: z.object({
    opening: Line,
    discovery: Line,
    discovery_question: Line,
    pitch: Line,
    pitch_question: Line,
    close: Line,
    confirm_slot: Line,
    wrap_up_booked: Line,
    wrap_up_not_booked: Line,
    availability_captured: Line,
  }),
  exits: z.object({
    no_time: Line,
    do_not_call: Line,
    hostile: Line,
    wrong_person: Line,
    silence: Line,
  }),
  steering: z.object({
    nudge: Line,
    hold_on_script: Line,
    anchor: z.object({ opening: Line, default: Line }),
    faq_no_match: Line,
    fillers: z.object({
      "en-US": z.array(z.string().trim().min(1)).min(2),
      "en-IN": z.array(z.string().trim().min(1)).min(2),
      hi: z.array(z.string().trim().min(1)).min(2),
    }),
  }),
  objections: z.object({
    not_interested: Line,
    already_use_competitor: Line,
    send_email: Line,
    how_much: Line,
    is_this_ai: Line,
    no_time: Line,
    who_gave_number: Line,
    call_later: Line,
    not_decision_maker: Line,
    need_to_think: Line,
    bad_past_experience: Line,
  }),
  faq: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        ask: z.array(z.string().trim().min(1)).min(1),
        en: z.string().trim().min(1),
        hi: z.string().trim().min(1),
      }),
    )
    .min(1),
});

export type CallScript = z.infer<typeof ScriptSchema>;
export type ScriptLang = "en" | "hi";

/** Every placeholder a line is allowed to use. Anything else is a typo. */
export const PLACEHOLDERS = [
  "name",
  "company",
  "ourCompany",
  "founder",
  "calls",
  "problem",
  "consequence",
  "slots",
  "slot",
  "close",
  "question",
  "rahe",
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type Vars = Partial<Record<Placeholder, string>>;

const PLACEHOLDER_RE = /\{([a-zA-Z]+)\}/g;

function assertKnownPlaceholders(script: CallScript, file: string): void {
  const allowed = new Set<string>(PLACEHOLDERS);
  const bad: string[] = [];
  const walk = (value: unknown, trail: string) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(PLACEHOLDER_RE)) {
        if (!allowed.has(m[1] ?? "")) bad.push(`${trail}: {${m[1]}}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${trail}[${i}]`));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, trail ? `${trail}.${k}` : k);
    }
  };
  walk(script, "");
  if (bad.length) {
    throw new Error(
      `${file} uses unknown placeholders (allowed: ${PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}):\n  ${bad.join("\n  ")}`,
    );
  }
}

let cached: CallScript | null = null;

export function scriptPath(): string {
  return path.resolve(config.root, config.scriptPath);
}

export function loadScript(file = scriptPath()): CallScript {
  const raw = parse(readFileSync(file, "utf8"));
  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Call script ${file} is invalid:\n${issues}`);
  }
  assertKnownPlaceholders(parsed.data, file);
  return parsed.data;
}

export function getScript(): CallScript {
  cached ??= loadScript();
  return cached;
}

/** Test hook — swap the script without touching disk. */
export function setScriptForTests(script: CallScript | null): void {
  cached = script;
}

export function scriptLang(language: PreferredLanguage): ScriptLang {
  return language === "hi-IN-hinglish" ? "hi" : "en";
}

/** Fill {placeholders}. Unknown keys were rejected at load time, so none survive here. */
export function render(template: string, vars: Vars): string {
  return template.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const v = vars[key as Placeholder];
    return v === undefined ? whole : v;
  });
}
