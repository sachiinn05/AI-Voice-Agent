import type { Intent, Lead, PreferredLanguage } from "../types.js";
import { closeLine, slotPair } from "./lines.js";

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

function topic(lead: Lead): string {
  const blob = `${lead.industry} ${lead.company_description}`.toLowerCase();
  if (/hospital|patient/.test(blob)) return "hospital";
  if (/grocery|order|shop/.test(blob)) return "order";
  if (/dental|clinic|appointment/.test(blob)) return "appointment";
  return lead.industry || "customer";
}

export function rebuttal(
  id: ObjectionId,
  lead: Lead,
  language: PreferredLanguage,
  slots: string[],
): string {
  const hi = language === "hi-IN-hinglish";
  const when = closeLine(language, slots);
  const pair = slotPair(language, slots);
  const kind = topic(lead);

  const lines: Record<ObjectionId, { en: string; hi: string }> = {
    not_interested: {
      en: `Sure, no problem. One thing — if a short demo isn't useful, we stop there. ${when}`,
      hi: `Sure, no problem. Bas ek cheez pooch sakta hoon — agar demo dekhne ke baad useful na lage, toh obviously aage kuch nahi karna. ${when}`,
    },
    already_use_competitor: {
      en: `That's fine. This isn't about replacing what you have. We can just compare whether AI helps your current setup. Want a short demo?`,
      hi: `Achha, perfect. Phir replace karne ki baat nahi hai. Hum bas compare karke dekh sakte hain ki AI aapke current setup mein kuch improve kar sakta hai ya nahi. Short demo chalega?`,
    },
    send_email: {
      en: `Sure, I'll email you. One suggestion — a live call is clearer than an email. If it's useful, read the email after. ${when}`,
      hi: `Bilkul, email kar deta hoon. Bas ek suggestion hai — email mein explain karne se better hai ki aap live call dekh lein. Agar useful laga toh baad mein email dekh lena. ${when}`,
    },
    how_much: {
      en: `Price depends on call volume and what you need, so I don't want to give a random number. The demo covers exact pricing too. ${when}`,
      hi: `Price ${kind === "hospital" ? "hospital ke call volume" : "call volume"} aur requirements par depend karta hai. Isliye main aapko random number nahi dena chahta. Demo mein exact pricing bhi explain ho jayegi. ${when}`,
    },
    is_this_ai: {
      en: `Yes, I'm Lipi's AI assistant. You're talking to me right now. If you want, the demo can show how this handles ${kind} calls in practice.`,
      hi: `Haan, main Lipi ka AI assistant hoon. Aap abhi mujhse hi baat kar rahe hain. Agar aap chahein toh demo mein dekh sakte hain ki ye ${kind} calls ko practically kaise handle karta hai.`,
    },
    no_time: {
      en: `Of course, no problem. I won't take your time now. Thank you.`,
      hi: `Bilkul, koi problem nahi. Abhi time nahi lunga. Thank you.`,
    },
    who_gave_number: {
      en: `We call relevant contacts at ${lead.company_name} for business outreach. If you don't want me to contact you again, I'll stop right here.`,
      hi: `Hum ${lead.company_name} ke relevant contacts ko business outreach ke liye call karte hain. Agar aap nahi chahte ki main dobara contact karun, toh main usse yahin stop kar deta hoon.`,
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
