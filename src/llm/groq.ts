import { config } from "../config.js";
import { firstName } from "../script/lines.js";
import { detectIntent } from "../script/intent.js";
import { scriptQuestionFor } from "../script/stateMachine.js";
import { IntentSchema, type Intent, type Session } from "../types.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";

const MODEL_CANDIDATES = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
];

const INTENT_LABELS = IntentSchema.options;

let resolvedModel: string | null = null;
let lastVia: "groq" | "script" | "steer" = "script";
let lastError = "";
let lastIntent: Intent | null = null;

export function groqEnabled(): boolean {
  return Boolean(config.groqApiKey);
}

export function groqStatus() {
  return { enabled: groqEnabled(), model: resolvedModel, lastVia, lastError, lastIntent };
}

async function discoverModel(): Promise<string> {
  if (resolvedModel) return resolvedModel;
  const preferred = [config.groqModel, ...MODEL_CANDIDATES].filter(Boolean);
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      headers: { Authorization: `Bearer ${config.groqApiKey}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      const hit =
        preferred.find((id) => ids.includes(id)) ??
        ids.find((id) => /gpt-oss-20b|gpt-oss-120b|qwen3\.6/i.test(id));
      if (hit) {
        resolvedModel = hit;
        console.log(`Groq model: ${hit}`);
        return hit;
      }
    }
  } catch {
    /* fall through */
  }
  resolvedModel = preferred[0] ?? "openai/gpt-oss-20b";
  return resolvedModel;
}

export function stripReasoning(raw: string): string {
  let text = raw ?? "";
  if (text.includes("</think>")) text = text.split("</think>").pop() ?? text;
  if (text.includes("</thinking>")) text = text.split("</thinking>").pop() ?? text;
  return text
    .replace(/<think>[\s\S]*/gi, " ")
    .replace(/<thinking>[\s\S]*/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIntent(raw: string): Intent | null {
  const cleaned = stripReasoning(raw)
    .toLowerCase()
    .replace(/[^a-z_]+/g, " ")
    .trim();
  const labels = [...INTENT_LABELS].sort((a, b) => b.length - a.length);
  for (const label of labels) {
    if (new RegExp(`(?:^|\\s)${label}(?:\\s|$)`).test(cleaned)) return label;
  }
  return null;
}

type ChatJson = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning?: string;
    };
  }>;
};

async function requestChat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; temperature?: number } = {},
) {
  const maxTokens = options.maxTokens ?? 64;
  const headers = {
    Authorization: `Bearer ${config.groqApiKey}`,
    "Content-Type": "application/json",
  };
  // MODEL_CANDIDATES are all Groq reasoning models. Left unconfigured, they
  // spend the whole token budget on hidden chain-of-thought and never reach
  // the actual answer — the caller then sees empty/truncated content and
  // silently falls back to the keyword matcher. Keep reasoning short and out
  // of `content` so the token budget is spent on the real answer.
  const base = {
    model,
    temperature: options.temperature ?? 0,
    messages,
    reasoning_effort: "low",
    reasoning_format: "hidden",
  };
  let res = await fetch(GROQ_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...base, max_completion_tokens: maxTokens }),
  });
  if (res.status === 400) {
    // Retry without the reasoning params too, in case a model rejects them.
    const { reasoning_effort: _re, reasoning_format: _rf, ...plain } = base;
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...plain, max_tokens: maxTokens }),
    });
  }
  return res;
}

export async function groqChat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!config.groqApiKey) throw new Error("GROQ_API_KEY missing");

  const modelsToTry = [await discoverModel(), ...MODEL_CANDIDATES];
  const seen = new Set<string>();
  lastError = "";

  for (const model of modelsToTry) {
    if (!model || seen.has(model)) continue;
    seen.add(model);

    let res = await requestChat(model, messages, options);
    if (res.status === 400) {
      res = await requestChat(model, messages, options);
    }

    if (!res.ok) {
      lastError = `Groq ${res.status}: ${(await res.text()).slice(0, 180)}`;
      // 429 = rate limited. Groq's free-tier limits are per-model, not
      // account-wide ("Rate limit reached for model `...`") — so a 429 on
      // one candidate doesn't mean the others are also exhausted. Try them
      // before giving up.
      if (res.status === 404 || res.status === 400 || res.status === 429) continue;
      throw new Error(lastError);
    }

    const data = (await res.json()) as ChatJson;
    const message = data.choices?.[0]?.message;
    const text = (message?.content || "").trim();
    if (!text) {
      lastError = "Groq returned empty content";
      continue;
    }
    resolvedModel = model;
    return text;
  }

  throw new Error(lastError || "Groq failed");
}

/** Groq only classifies intent. The app then speaks a locked script line. */
export async function classifyIntent(session: Session, userText: string): Promise<Intent> {
  const fallback = detectIntent(userText);
  if (!groqEnabled()) {
    lastVia = "script";
    lastIntent = fallback;
    return fallback;
  }

  const lastAgent =
    [...session.turns].reverse().find((turn) => turn.role === "agent")?.text ?? "";

  try {
    const raw = await groqChat([
      {
        role: "system",
        content: `Classify one outbound sales-call utterance. Reply with ONLY one label.
Labels: ${INTENT_LABELS.join(", ")}
Rules:
- busy / no time / abhi time nahi / 1 min nahi / mere paas time nahi / nahi mil sakte → no_time
- don't call / mat call / stop calling → dnc
- angry / scam / shut up → hostile
- monday / tuesday / pehla / first / second → accept_slot
- yes / ok / haan / theek / right → acknowledge
- not interested / nahi chahiye → not_interested
- already use something → already_use_competitor
- email / whatsapp → send_email
- price / kitna / refund / policy / services / products / plans / features → company_knowledge
- how much for a specific plan or policy → company_knowledge
- book a demo / schedule a meeting → booking_request
- price objection without a company-fact question → how_much
- are you AI / bot → is_this_ai
- who gave number → who_gave_number
- call later / baad mein → call_later
- none of those times → decline_slots
- I'm free Thursday → give_availability
- company services, pricing, refund, policy, hours, products, plans → company_knowledge
- off-topic / weather / cricket / cannot map → company_knowledge
If none fit, company_knowledge.`,
      },
      {
        role: "user",
        content: `Call beat: ${session.state}
Agent last said: ${lastAgent || "(opening)"}
Caller said: ${userText}`,
      },
    ], {
      // Reasoning models sometimes ignore reasoning_effort/reasoning_format
      // and still spend the token budget thinking out loud before the
      // label. 64 tokens cut that off mid-thought — nothing left to parse,
      // so it silently fell back to keywords. Give it real headroom instead
      // of hoping it skips reasoning.
      maxTokens: 300,
    });
    const intent = parseIntent(raw);
    if (!intent) {
      lastVia = "script";
      lastIntent = fallback;
      lastError = "Groq intent unclear, used keywords";
      console.warn(lastError, raw.slice(0, 160));
      return fallback;
    }
    lastVia = "groq";
    lastIntent = intent;
    lastError = "";
    console.log(`Groq intent (${resolvedModel}): ${intent}`);
    return intent;
  } catch (error) {
    lastVia = "script";
    lastIntent = fallback;
    lastError = error instanceof Error ? error.message : "Groq failed";
    console.warn("Groq intent failed, using keywords:", lastError);
    return fallback;
  }
}

function languageHint(language: string): string {
  if (language === "hi-IN-hinglish") return "Speak simple Hinglish only.";
  if (language === "en-IN") return "Speak spoken Indian English only.";
  return "Speak spoken US English only.";
}

function tidySpoken(raw: string, fallback: string): string {
  const cleaned = stripReasoning(raw).replace(/^["']|["']$/g, "");
  const sentences = cleaned
    .split(/(?<=[.!?।…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, 2);
  const spoken = sentences.join(" ").replace(/\?\./g, "?").trim();
  if (spoken.length < 12 || spoken.length > 280) return fallback;
  if (/prospect:|thinking|script question|analyze/i.test(spoken)) return fallback;
  return spoken;
}

/** Off-script only: acknowledge, then ask the current script question again. */
export async function steerBackToScript(session: Session, userText: string, fallback: string): Promise<string> {
  if (!groqEnabled()) {
    lastVia = "script";
    return fallback;
  }

  const anchor = scriptQuestionFor(session);
  const name = firstName(session.lead);

  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content: `${languageHint(session.lead.preferred_language)} Live phone call. The caller went off the script.
Output ONLY 1 or 2 short spoken sentences. No thinking, no labels.
Briefly acknowledge what they said. Do not invent pricing, hospital facts, or extra product claims.
Then immediately ask this exact question again: ${anchor}
One question only. Then stop.`,
        },
        {
          role: "user",
          content: `${name} said: "${userText}". Bring them back to: ${anchor}`,
        },
      ],
      { maxTokens: 220, temperature: 0.3 },
    );
    const spoken = tidySpoken(raw, "");
    if (!spoken) {
      lastVia = "script";
      lastError = "Groq steer empty, used hold line";
      return fallback;
    }
    lastVia = "steer";
    lastError = "";
    console.log(`Groq steer (${resolvedModel}): ${spoken}`);
    return spoken;
  } catch (error) {
    lastVia = "script";
    lastError = error instanceof Error ? error.message : "Groq steer failed";
    console.warn("Groq steer failed, using hold line:", lastError);
    return fallback;
  }
}

/**
 * On-script: the state machine already decided WHAT to say (the `canned` line
 * carries every fact — slot times, price disclaimers, the CTA). This only
 * asks Groq to rephrase it the way a real salesperson would say it out loud,
 * reacting briefly to what the caller just said, so the call doesn't repeat
 * the identical sentence every time it hits the same beat.
 *
 * Safety: if `mustInclude` facts (an offered slot, a booked slot) don't
 * survive the rephrase, the canned line is used instead — free-flowing
 * wording, never free-flowing facts.
 */
export async function naturalizeReply(
  session: Session,
  userText: string,
  canned: string,
  mustInclude: string[] = [],
): Promise<string> {
  if (!groqEnabled()) {
    lastVia = "script";
    return canned;
  }

  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content: `${languageHint(session.lead.preferred_language)} Live outbound sales call. Rephrase the line below the way a real, warm salesperson would say it out loud, briefly reacting to what the caller just said.
Rules:
- Keep every fact, number, name, and time in the line exactly as given. Do not drop, add, or invent any.
- Keep the same question / call-to-action at the end.
- 1-2 short spoken sentences. No lists, no markdown, no labels.
Output ONLY the rephrased spoken line.`,
        },
        {
          role: "user",
          content: `Caller just said: "${userText}"\nLine to say: "${canned}"`,
        },
      ],
      { maxTokens: 220, temperature: 0.5 },
    );
    const spoken = tidySpoken(raw, "");
    if (!spoken) {
      lastVia = "script";
      return canned;
    }
    const lower = spoken.toLowerCase();
    const droppedFact = mustInclude.some((fact) => fact && !lower.includes(fact.toLowerCase()));
    if (droppedFact) {
      lastVia = "script";
      return canned;
    }
    lastVia = "steer";
    lastError = "";
    console.log(`Groq natural (${resolvedModel}): ${spoken}`);
    return spoken;
  } catch (error) {
    lastVia = "script";
    lastError = error instanceof Error ? error.message : "Groq naturalize failed";
    console.warn("Groq naturalize failed, using scripted line:", lastError);
    return canned;
  }
}
