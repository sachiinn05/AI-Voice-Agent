/**
 * "RAG on the script": answer a caller's question from the `faq:` section of
 * scripts/call-script.yaml — and only from there.
 *
 * Retrieval is local (hashed n-gram embeddings + word overlap over each
 * entry's `ask` phrasings). When the best match is clear, it's used as-is.
 * When two entries are close, Groq is asked to pick one — or NONE — from the
 * shortlist. It is never asked to write an answer. The spoken text is always
 * the script's own line, verbatim.
 */
import { config } from "../config.js";
import { groqChat, groqEnabled, stripReasoning } from "../llm/groq.js";
import type { Lead, PreferredLanguage } from "../types.js";
import { firstName, topicFor } from "./lines.js";
import { getScript, render, scriptLang, type CallScript } from "./scriptFile.js";
import { cosine, embed, tokens, wordOverlap } from "./similarity.js";

type FaqEntry = CallScript["faq"][number];

type Indexed = {
  entry: FaqEntry;
  vectors: number[][];
};

export type FaqMatch = {
  id: string;
  answer: string;
  score: number;
  via: "match" | "groq";
};

// Above this, the local match is trusted outright. Between this and FLOOR,
// Groq arbitrates among the top candidates. Below FLOOR, it's not a question
// we cover. Tuned against the phrasings in the script and STT-style drift.
const CONFIDENT = 0.62;
const FLOOR = 0.22;

let index: Indexed[] | null = null;
let indexedFrom: CallScript | null = null;

function buildIndex(script: CallScript): Indexed[] {
  return script.faq.map((entry) => ({
    entry,
    vectors: entry.ask.map((phrase) => embed(phrase)),
  }));
}

function getIndex(): Indexed[] {
  const script = getScript();
  if (!index || indexedFrom !== script) {
    index = buildIndex(script);
    indexedFrom = script;
  }
  return index;
}

/** Test hook: force a re-index after setScriptForTests(). */
export function resetFaqIndex(): void {
  index = null;
  indexedFrom = null;
}

function scoreEntry(question: string, qvec: number[], item: Indexed): number {
  let best = 0;
  for (let i = 0; i < item.entry.ask.length; i += 1) {
    const phrase = item.entry.ask[i] ?? "";
    const sim = cosine(qvec, item.vectors[i] ?? []);
    const overlap = wordOverlap(question, phrase);
    best = Math.max(best, 0.6 * sim + 0.4 * overlap);
  }
  return best;
}

async function groqPick(question: string, candidates: Array<{ item: Indexed; score: number }>): Promise<string | null> {
  const menu = candidates
    .map(({ item }) => `${item.entry.id}: ${item.entry.ask.slice(0, 3).join(" / ")}`)
    .join("\n");
  try {
    const raw = await groqChat(
      [
        {
          role: "system",
          content: `A caller on a sales call asked a question. Pick which FAQ entry answers it. Reply with ONLY the entry id, or NONE if none of them fit. No explanation.`,
        },
        { role: "user", content: `Caller asked: "${question}"\n\nFAQ entries:\n${menu}` },
      ],
      { maxTokens: 120, temperature: 0 },
    );
    const cleaned = stripReasoning(raw).trim().toLowerCase().replace(/[^a-z_]/g, "");
    if (!cleaned || cleaned === "none") return null;
    return candidates.find(({ item }) => item.entry.id === cleaned)?.item.entry.id ?? null;
  } catch {
    return null;
  }
}

function renderAnswer(entry: FaqEntry, lead: Lead, language: PreferredLanguage): string {
  const l = scriptLang(language);
  const t = topicFor(lead);
  return render(entry[l], {
    name: firstName(lead),
    company: lead.company_name,
    ourCompany: config.companyName || "our company",
    founder: config.founderName || "Sachin",
    calls: l === "hi" ? t.nounHi : t.noun,
    problem: l === "hi" ? t.fullHi : t.full,
    consequence: l === "hi" ? t.consequenceHi : t.consequence,
  });
}

/** Find the FAQ entry that answers `question`, or null if the script doesn't cover it. */
export async function answerFromScript(
  question: string,
  lead: Lead,
  language: PreferredLanguage,
): Promise<FaqMatch | null> {
  const qvec = embed(question);
  const ranked = getIndex()
    .map((item) => ({ item, score: scoreEntry(question, qvec, item) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < FLOOR) return null;

  const runnerUp = ranked[1]?.score ?? 0;
  // A single content word ("what TIME is it" → setup_TIME) can score high on
  // nothing but that word. Trust the local match outright only when it's
  // near-exact, or when there are at least two content words behind it.
  const contentWords = tokens(question).length;
  const nearExact = top.score >= 0.9;
  const clearWinner = nearExact || (top.score >= CONFIDENT && top.score - runnerUp >= 0.1 && contentWords >= 2);

  if (clearWinner) {
    return { id: top.item.entry.id, answer: renderAnswer(top.item.entry, lead, language), score: top.score, via: "match" };
  }
  if (!groqEnabled()) return null;

  const pickedId = await groqPick(question, ranked.slice(0, 3));
  if (!pickedId) return null;
  const picked = ranked.find(({ item }) => item.entry.id === pickedId);
  if (!picked) return null;
  return { id: pickedId, answer: renderAnswer(picked.item.entry, lead, language), score: picked.score, via: "groq" };
}
