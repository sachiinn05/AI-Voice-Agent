import type { Lead, PreferredLanguage } from "../types.js";
import { config } from "../config.js";

export function firstName(lead: Lead): string {
  return lead.contact_name.trim().split(/\s+/)[0] ?? lead.contact_name;
}

function hi(language: PreferredLanguage): boolean {
  return language === "hi-IN-hinglish";
}

function founder(): string {
  return config.founderName || "Sachin";
}

function company(): string {
  return config.companyName || "our company";
}

export type Topic = {
  key: "hospital" | "order" | "appointment" | "general";
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

/** Maps a lead's industry/description to the concrete problem this call is about. */
export function topicFor(lead: Lead): Topic {
  const blob = `${lead.industry} ${lead.company_description} ${lead.need_for_bot}`.toLowerCase();
  if (/hospital|patient/.test(blob)) {
    return {
      key: "hospital",
      noun: "patient calls",
      nounHi: "patient calls",
      full: "after-hours patient calls that go unanswered",
      fullHi: "raat ke patient calls jo miss ho jaate hain",
      consequence: "a patient who needed help and got a dead line",
      consequenceHi: "ek patient ko urgent madad chahiye thi aur line hi nahi lagi",
    };
  }
  if (/grocery|order|delivery/.test(blob)) {
    return {
      key: "order",
      noun: "order-status calls",
      nounHi: "order-status calls",
      full: "\"where is my order\" calls flooding your line",
      fullHi: "\"order kahan hai\" wale calls jo line block karte hain",
      consequence: "a frustrated customer who doesn't order again",
      consequenceHi: "customer frustrate hoke dobara order hi nahi karta",
    };
  }
  if (/dental|clinic|appointment/.test(blob)) {
    return {
      key: "appointment",
      noun: "appointment calls",
      nounHi: "appointment calls",
      full: "appointment calls that never get through",
      fullHi: "appointment ke calls jo connect hi nahi hote",
      consequence: "a patient who just books the clinic down the street",
      consequenceHi: "patient bagal wali clinic mein book kar leta hai",
    };
  }
  return {
    key: "general",
    noun: "missed calls",
    nounHi: "missed calls",
    full: "calls you're probably missing right now",
    fullHi: "calls jo abhi miss ho rahe honge",
    consequence: "a customer who just calls your competitor next",
    consequenceHi: "customer seedha competitor ko call kar leta hai",
  };
}

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
    if (hi(language)) {
      out.push(`${weekday} ${hour === 11 ? "11 baje" : "3 baje"}`);
    } else {
      out.push(`${weekday} at ${hour === 11 ? "11" : "3"}`);
    }
  }
  return out;
}

/** Outbound cold-open: say who's calling and why, then ask for a minute. Nothing else. */
export function openingLine(lead: Lead, language: PreferredLanguage): string {
  const name = firstName(lead);
  if (hi(language)) {
    return `Namaste ${name}, main ${company()} ka AI assistant hoon, ${founder()} ki taraf se call kar raha hoon. Bilkul chhota sa call hai — ek minute milega?`;
  }
  return `Hi ${name}, this is ${company()}'s AI assistant, calling on behalf of ${founder()}. It'll only take a minute — is now an okay time?`;
}

/** The discovery question this call is actually built around. Lead-specific, not a menu. */
export function problemQuestion(lead: Lead, language: PreferredLanguage): string {
  const t = topicFor(lead);
  if (hi(language)) {
    return `${lead.company_name} mein abhi ${t.fullHi} — yeh kaise handle karte hain?`;
  }
  return `How is ${lead.company_name} handling ${t.full} today?`;
}

/** Company intro beat: thank them for the minute, ask the one discovery question. */
export function contextBridge(lead: Lead, language: PreferredLanguage): string {
  if (hi(language)) {
    return `Shukriya. Ek quick sawal — ${problemQuestion(lead, language)}`;
  }
  return `Thanks. Quick question — ${problemQuestion(lead, language)}`;
}

/** Acknowledge, sell the outcome (not just the feature), ask for a demo. Then wait. */
export function pitchLine(lead: Lead, language: PreferredLanguage): string {
  const t = topicFor(lead);
  if (hi(language)) {
    return `Samajh gaya. Har baar jo call miss hoti hai, uska matlab ${t.consequenceHi}. ${company()} ek AI voice agent deta hai jo ${t.nounHi} turant pick karta hai, chaahe koi available ho ya na ho. Ek chhota demo dikhaun?`;
  }
  return `Got it. Every one of those calls that goes unanswered means ${t.consequence}. ${company()} gives you an AI voice agent that picks up ${t.noun} the moment they come in — want a quick demo?`;
}

export function slotPair(language: PreferredLanguage, slots: string[]): string {
  const a = slots[0] ?? "Monday 11";
  const b = slots[1] ?? "Tuesday 3";
  return hi(language) ? `${a} ya ${b}` : `${a} or ${b}`;
}

export function closeLine(language: PreferredLanguage, slots: string[]): string {
  const pair = slotPair(language, slots);
  if (hi(language)) {
    return `Bilkul. Mere paas ${pair} available hai — aapke liye kya better rahega?`;
  }
  return `Sure thing — I've got ${pair} open. Which works better for you?`;
}

export function confirmSlotLine(language: PreferredLanguage, slot: string): string {
  if (hi(language)) {
    return `${slot} lock karun?`;
  }
  return `Shall I lock ${slot}?`;
}

export function wrapUpLine(
  lead: Lead,
  language: PreferredLanguage,
  booked: string | null,
): string {
  const name = firstName(lead);
  const link = config.calBookingUrl
    ? hi(language)
      ? " Main confirmation link bhej deta hoon."
      : " I'll send the confirmation link."
    : "";
  if (hi(language)) {
    return booked
      ? `Perfect, ${booked} rakh dete hain. ${founder()} aapko demo de denge.${link} Thank you, ${name}.`
      : `Theek hai, koi problem nahi. Thank you, ${name}.`;
  }
  return booked
    ? `Perfect, I'll lock ${booked}. ${founder()} will run the demo.${link} Thank you, ${name}.`
    : `All good, no problem. Thank you, ${name}.`;
}

export function noTimeHangupLine(lead: Lead, language: PreferredLanguage): string {
  const name = firstName(lead);
  if (hi(language)) {
    return `Bilkul, koi problem nahi ${name}. Abhi time nahi lunga. Thank you.`;
  }
  return `Of course, no problem ${name}. I won't take your time now. Thank you.`;
}

export function fallbackLine(language: PreferredLanguage): string {
  if (hi(language)) {
    return `Understood. Main aapka time waste nahi karunga. Thank you.`;
  }
  return `Understood. I won't waste your time. Thank you.`;
}

export function dncLine(language: PreferredLanguage): string {
  if (hi(language)) {
    return `Absolutely, understood. Main dobara call nahi karunga. Have a good day.`;
  }
  return `Absolutely, understood. I won't call again. Have a good day.`;
}

export function nudgeLine(lead: Lead, language: PreferredLanguage): string {
  const name = firstName(lead);
  if (hi(language)) {
    return `${name}, kya aap mujhe sun pa rahe hain?`;
  }
  return `${name}, can you still hear me?`;
}

export function silenceHangupLine(language: PreferredLanguage): string {
  if (hi(language)) {
    return `Lagta hai connection issue hai. Main call yahin end karta hoon. Thank you.`;
  }
  return `Looks like a connection issue. I'll end the call here. Thank you.`;
}

export function currentScriptQuestion(lead: Lead, language: PreferredLanguage, state: string): string {
  if (state === "OPENING") {
    return hi(language) ? "Ek minute milega?" : "Is now an okay time?";
  }
  if (state === "CONTEXT_BRIDGE") return problemQuestion(lead, language);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") {
    return hi(language) ? "Ek chhota demo dikhaun?" : "Want a quick demo?";
  }
  if (state === "CLOSE") return closeLine(language, defaultMeetingSlots(language));
  return hi(language) ? "Haan, boliye." : "Yeah, go ahead.";
}

export function holdOnScriptLine(lead: Lead, language: PreferredLanguage, state: string): string {
  const question = currentScriptQuestion(lead, language, state);
  return hi(language) ? `Samajh gaya. ${question}` : `Got it. ${question}`;
}
