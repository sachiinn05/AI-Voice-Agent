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

function industryBlob(lead: Lead): string {
  return `${lead.industry} ${lead.company_description} ${lead.need_for_bot}`.toLowerCase();
}

function topicWord(lead: Lead, language: PreferredLanguage): string {
  const blob = industryBlob(lead);
  if (/hospital|patient/.test(blob)) return hi(language) ? "hospital" : "hospital";
  if (/grocery|order|shop/.test(blob)) return hi(language) ? "order" : "order";
  if (/dental|clinic|appointment/.test(blob)) return hi(language) ? "appointment" : "appointment";
  return lead.industry || "customer";
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

export function openingLine(lead: Lead, language: PreferredLanguage): string {
  const name = firstName(lead);
  if (hi(language)) {
    return `Namaste ${name}, main Lipi se AI assistant bol raha hoon. Abhi ek minute hai?`;
  }
  return `Hi ${name}, this is Lipi's AI assistant. Have you got a minute?`;
}

export function problemQuestion(lead: Lead, language: PreferredLanguage): string {
  const blob = industryBlob(lead);
  const company = lead.company_name;
  if (hi(language)) {
    if (/hospital|patient/.test(blob)) {
      return `Agar raat mein koi patient ${company} ke number par call kare aur staff available na ho, toh call miss ho sakti hai, right?`;
    }
    if (/grocery|order|shop/.test(blob)) {
      return `Customers baar baar call karke poochte hain unka order kahan hai, right?`;
    }
    if (/dental|clinic|appointment/.test(blob)) {
      return `Appointment line busy rehti hai aur log book kiye bina hang up kar dete hain, right?`;
    }
    return `${lead.company_description} — yeh aapke yahan ho raha hai, right?`;
  }
  if (/hospital|patient/.test(blob)) {
    return `If a patient calls ${company} at night and nobody is at the desk, that call gets missed, right?`;
  }
  if (/grocery|order|shop/.test(blob)) {
    return `Shoppers keep calling to ask where their order is, right?`;
  }
  if (/dental|clinic|appointment/.test(blob)) {
    return `The appointment line stays busy and people hang up before they can book, right?`;
  }
  return `${lead.company_description} — that happens on your side, right?`;
}

/** One personalized beat. Then wait. */
export function contextBridge(lead: Lead, language: PreferredLanguage): string {
  const question = problemQuestion(lead, language);
  if (hi(language)) {
    return `Thank you. Main actually ${lead.company_name} ko lekar call kar raha hoon. ${question}`;
  }
  return `Thank you. I'm calling about ${lead.company_name}. ${question}`;
}

/** Short capability + one demo ask. Then wait. */
export function pitchLine(lead: Lead, language: PreferredLanguage): string {
  const topic = topicWord(lead, language);
  if (hi(language)) {
    if (topic === "hospital") {
      return `Humara AI us time phone attend kar sakta hai, patient ki basic query samajh sakta hai, aur zarurat ho toh call ya message team tak forward kar sakta hai. Main aapko ek short demo dikha doon?`;
    }
    return `Humara AI us time phone attend kar sakta hai, ${topic} ki basic query samajh sakta hai, aur zarurat ho toh team tak forward kar sakta hai. Main aapko ek short demo dikha doon?`;
  }
  return `Our AI can pick up then, understand a basic ${topic} query, and pass it to your team if needed. Can I show you a short demo?`;
}

export function slotPair(language: PreferredLanguage, slots: string[]): string {
  const a = slots[0] ?? "Monday 11";
  const b = slots[1] ?? "Tuesday 3";
  return hi(language) ? `${a} ya ${b}` : `${a} or ${b}`;
}

export function closeLine(language: PreferredLanguage, slots: string[]): string {
  const pair = slotPair(language, slots);
  if (hi(language)) {
    return `${pair} — aapke liye kya convenient rahega?`;
  }
  return `${pair} — what works better for you?`;
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
    return hi(language) ? "Abhi ek minute hai?" : "Have you got a minute?";
  }
  if (state === "CONTEXT_BRIDGE") return problemQuestion(lead, language);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") {
    return hi(language) ? "Main aapko ek short demo dikha doon?" : "Can I show you a short demo?";
  }
  if (state === "CLOSE") return closeLine(language, defaultMeetingSlots(language));
  return hi(language) ? "Haan, boliye." : "Yeah, go ahead.";
}

export function holdOnScriptLine(lead: Lead, language: PreferredLanguage, state: string): string {
  const question = currentScriptQuestion(lead, language, state);
  return hi(language) ? `Samajh gaya. ${question}` : `Got it. ${question}`;
}

export function continuePrompt(language: PreferredLanguage): string {
  if (hi(language)) {
    return `Haan, boliye.`;
  }
  return `Yeah, go ahead.`;
}
