import { config } from "../config.js";

export function bookingFallbackLink(): string | null {
  return config.calBookingUrl || null;
}

/** V1: confirm the spoken slot. Cal.com/Calendly API is optional. */
export async function bookSlot(slotLabel: string, attendeeName: string): Promise<{
  ok: boolean;
  slot: string;
  via: "cal.com" | "logged";
  url?: string;
}> {
  if (!config.calApiKey || !config.calEventTypeId) {
    return { ok: true, slot: slotLabel, via: "logged", url: config.calBookingUrl || undefined };
  }

  try {
    const res = await fetch("https://api.cal.com/v1/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventTypeId: Number(config.calEventTypeId),
        start: slotLabel,
        responses: { name: attendeeName },
        metadata: { source: "lipi-v1" },
      }),
    });
    if (!res.ok) {
      return { ok: true, slot: slotLabel, via: "logged", url: config.calBookingUrl || undefined };
    }
    return { ok: true, slot: slotLabel, via: "cal.com" };
  } catch {
    return { ok: true, slot: slotLabel, via: "logged" };
  }
}
