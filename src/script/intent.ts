import type { Intent } from "../types.js";

const PATTERNS: Array<{ intent: Intent; re: RegExp }> = [
  {
    intent: "dnc",
    re: /\b(do not call|don'?t call|dnc|remove (me|my number)|opt[- ]?out|stop calling|mat call|dobara (nahi|mat) call)\b/i,
  },
  {
    intent: "hostile",
    re: /\b(scam|fraud|idiot|stupid|shut up|harass|complaint|lawyer|police)\b/i,
  },
  { intent: "voicemail", re: /\b(voicemail|leave a message|after the (beep|tone))\b/i },
  {
    intent: "gatekeeper",
    re: /\b(who is (this|calling)|not available|in a meeting|i('ll| will) take a message|assistant to)\b/i,
  },
  { intent: "wrong_person", re: /\b(wrong (number|person)|no one (by|named)|galat (number|aadmin))\b/i },
  { intent: "is_this_ai", re: /\b(are you (an? )?(ai|bot|robot)|is this (an? )?(ai|bot|recording)|kya (yeh )?ai)\b/i },
  { intent: "who_gave_number", re: /\b(who gave|where did you get|number kahan|kaise mila)\b/i },
  { intent: "already_use_competitor", re: /\b(already (have|use)|pehle se|we use (vapi|retell|bolna|exotel)|competitor)\b/i },
  {
    intent: "booking_request",
    re: /\b(book (me )?(a )?(demo|meeting|call|slot)|schedule (a )?(demo|meeting|call)|demo book|meeting book)\b/i,
  },
  {
    intent: "company_knowledge",
    re: /\b(what (services|products|plans?|pricing|refund|policy|hours|features)|tell me about|do you (offer|provide|support|have)|refund|warranty|guarantee|policy|services?|products?)\b/i,
  },
  { intent: "how_much", re: /\b(how much|pricing|price|cost|expensive|kitna|price kya)\b/i },
  { intent: "send_email", re: /\b(send (me )?(an? )?email|email me|email bhej|whatsapp)\b/i },
  { intent: "call_later", re: /\b(call (me )?(later|back)|baad mein|next week|kal call)\b/i },
  {
    intent: "no_time",
    re: /no time|can't talk|bad time|time nahi|time nhi|abhi time nahi|abhi nahi|abhi busy|(?:ek |1 )?min(?:ute)?s?\s*(nahi|nhi)|(mere )?paas.{0,24}(nahi|nhi)|(nahi|nhi)\s+(mil|ho sakta|ho sakte|de sakti|baat kar)|nahi mil|nhi mil|mil sakte/i,
  },
  { intent: "not_interested", re: /\b(not interested|no thanks|don't (need|want)|pehli nahi|zaroorat nahi)\b/i },
  {
    intent: "accept_slot",
    re: /\b(first|second|gyarah|teen|eleven|three|book it|lock (it|kar)|that one|pehla|doosra|monday|tuesday|11|3 baje)\b/i,
  },
  { intent: "decline_slots", re: /\b(none (of )?(those|them)|no slot|doesn't work|dono nahi)\b/i },
  { intent: "give_availability", re: /\b(i('m| am) free|available|thursday|friday|wednesday)\b/i },
  {
    intent: "acknowledge",
    re: /\b(okay|ok|haan|han|haanji|hmm|hum|ji|yes|yeah|yep|sure|alright|right|no problem|theek|achha|accha|bilkul|boliye|go on|go ahead|tell me|continue)\b/i,
  },
  { intent: "interested", re: /\b(interested|sounds good|sounds interesting|let'?s do|karte hain|chalo|why not)\b/i },
];

// How browser STT actually transcribes a spoken "haan" / "haan haan" / "ji".
// Only trusted when it's the ENTIRE utterance: "ham" alone is a misheard
// "haan", but "ham unhen subah call karte hain" means "we call them…".
const SHORT_YES_RE =
  /^(haan|han|ham|hn|haa|hain|hanji|haanji|ji|ji haan|haan ji|hmm|hm|ok|okay|yes|yeah|yep|yup|sure|theek|thik|theek hai|thik hai|bilkul|achha|accha)(\s+(haan|han|ji|ok|okay|yes|hai|bilkul))?[.!]?$/i;

export function detectIntent(text: string): Intent {
  const trimmed = text.trim();
  if (!trimmed) return "unclear";
  if (SHORT_YES_RE.test(trimmed)) return "acknowledge";
  for (const { intent, re } of PATTERNS) {
    if (re.test(trimmed)) return intent;
  }
  return "unclear";
}

export function isContinue(intent: Intent): boolean {
  return intent === "acknowledge" || intent === "interested";
}

export function isOffScript(intent: Intent): boolean {
  return intent === "unclear" || intent === "voicemail" || intent === "gatekeeper";
}
