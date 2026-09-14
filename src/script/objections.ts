import { config } from "../config.js";
import type { Intent, Lead, PreferredLanguage } from "../types.js";
import { closeLine, slotPair, topicFor } from "./lines.js";

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
  const hi = language === "hi-IN-hinglish";
  const when = closeLine(language, slots);
  const pair = slotPair(language, slots);
  const t = topicFor(lead);

  const lines: Record<ObjectionId, { en: string; hi: string }> = {
    not_interested: {
      en: `Totally get it — a lot of people feel that way at first. But once they actually see it catch ${t.noun} live, most change their mind fast. If a short demo isn't useful, we stop right there, no pressure. ${when}`,
      hi: `Bilkul samajh sakta hoon — zyada log pehle aisa hi sochte hain. Lekin jab woh demo mein live ${t.nounHi} handle hote dekhte hain, zyadatar apna mind badal lete hain. Agar useful na lage toh wahin ruk jaate hain, koi pressure nahi. ${when}`,
    },
    already_use_competitor: {
      en: `Good to know — this isn't about ripping that out. Think of it as a second opinion: we compare how it handles ${t.noun} against what you already have. Worth a short look?`,
      hi: `Achha, good to know. Yeh replace karne ki baat nahi hai — bas ek second opinion samjho. Hum compare kar sakte hain ki ${t.nounHi} ko aapka current setup kitna achhe se handle karta hai. Short demo dekhna chahenge?`,
    },
    send_email: {
      en: `Happy to email it over. Just so you know, a 2-minute call usually explains it faster than reading — if it's not useful, feel free to ignore the email after. ${when}`,
      hi: `Bilkul, email kar deta hoon. Bas itna — 2 minute ka call usually padhne se fast samajh aata hai. Agar useful na laga toh email ignore kar dena. ${when}`,
    },
    how_much: {
      en: `It depends on your call volume, so I won't quote a random number. The demo walks through exact pricing once we've seen how many ${t.noun} you're actually getting. ${when}`,
      hi: `Yeh aapke call volume par depend karta hai, isliye main random number nahi dunga. Demo mein exact pricing dikh jaayegi jab pata chalega ki kitne ${t.nounHi} aate hain. ${when}`,
    },
    is_this_ai: {
      en: `Yes, I'm ${config.companyName}'s AI assistant. You're talking to me right now. Ask me about our services or pricing, or I can book a demo.`,
      hi: `Haan, main ${config.companyName} ka AI assistant hoon. Aap abhi mujhse hi baat kar rahe hain. Services ya pricing pooch sakte ho, ya main demo book kar doon.`,
    },
    no_time: {
      en: `Of course, no problem. I won't take your time now. Thank you.`,
      hi: `Bilkul, koi problem nahi. Abhi time nahi lunga. Thank you.`,
    },
    who_gave_number: {
      en: `This is ${config.companyName} calling about our voice assistant. If you don't want me to contact you again, I'll stop right here.`,
      hi: `Yeh ${config.companyName} ka call hai hamare voice assistant ke baare mein. Agar aap nahi chahte ki main dobara contact karun, toh main yahin stop karta hoon.`,
    },
    call_later: {
      en: `Sure. I can call back later. Or if it's easier, lock one time now — ${pair}?`,
      hi: `Sure. Main baad mein call kar sakta hoon. Waise agar aapko convenient ho toh ${pair} mein se ek time fix kar dein?`,
    },
  };

  return hi ? lines[id].hi : lines[id].en;
}

export function intentToObjection(intent: Intent): ObjectionId | null {
  for (const [id, meta] of Object.entries(OBJECTION_MAP)) {
    if (meta.intent === intent) return id as ObjectionId;
  }
  return null;
}
