/**
 * Tiny, keyless text similarity for matching a caller's question to the FAQ.
 * Hashed character n-grams + cosine: no model download, no API, deterministic,
 * and forgiving of the spelling drift that speech-to-text produces
 * ("kitna kharcha" vs "kitna karcha").
 */

function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Function words carry no meaning for matching but dominate similarity if
// left in: "are you married" scored 0.65 against "who are you" on nothing but
// "are you". English + Hinglish. Question words are included deliberately —
// nearly every FAQ phrasing starts with one, so they distinguish nothing.
const STOPWORDS = new Set(
  (
    "a an the is are am was were be been do does did can could will would should shall may might " +
    "it its this that these those there here i me my we our us you your he she they them his her their " +
    "to of for in on at by with from as into about over under and or but not no so if then than " +
    "what how when where which who whom why whats hows " +
    "tell me please just really actually like kind sort thing things something anything " +
    "kya kaise kab kahan kaun kyun kyon kitna kitne kitni hai hain ho hoon tha thi the ka ki ke ko " +
    "mein me se par pe aur ya toh to bhi hi ye yeh woh wo yah is us aap aapka aapki aapke hum hamara hamare " +
    "main mera mere meri kar karna karte karta karti sakta sakte sakti hoga hogi honge bata batao bataiye"
  ).split(/\s+/),
);

export function tokens(text: string): string[] {
  const all = normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 1);
  const content = all.filter((t) => !STOPWORDS.has(t));
  // "what is this about" / "aap kaun ho" are entirely function words. Keep
  // them so an exact phrasing from the script still matches itself.
  return content.length ? content : all;
}

export function embed(text: string, dimensions = 512): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  for (const token of tokens(text)) {
    for (let n = 2; n <= Math.min(4, token.length); n += 1) {
      for (let i = 0; i <= token.length - n; i += 1) {
        const idx = hash32(token.slice(i, i + n)) % dimensions;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
    }
    const idx = hash32(token) % dimensions;
    vec[idx] = (vec[idx] ?? 0) + 1.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm ? vec.map((v) => v / norm) : vec;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/** Share of the query's words that appear in the candidate. */
export function wordOverlap(query: string, candidate: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const c = new Set(tokens(candidate));
  return q.filter((w) => c.has(w)).length / q.length;
}
