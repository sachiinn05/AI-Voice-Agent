import { config } from "../config.js";
import { resolveSlotStart } from "./slotTime.js";

export function bookingFallbackLink(): string | null {
  return config.calBookingUrl || null;
}

export type BookingOutcome = {
  /** "cal.com" = a real calendar event exists; "logged" = only recorded locally. */
  via: "cal.com" | "logged";
  /** ISO start time we asked for, when the spoken slot could be resolved. */
  start?: string;
  /** Cal.com booking uid / id, for cancel + reschedule links. */
  uid?: string;
  /** Email Cal.com sent the confirmation (and will send the reminder) to. */
  emailedTo?: string;
  /** Why a real booking didn't happen — shown on the dashboard, never spoken. */
  note?: string;
};

/**
 * Create a real Cal.com booking for the slot the caller agreed to on the call.
 * Cal.com emails the attendee a confirmation + calendar invite and sends its
 * own reminder before the meeting, so no separate mailer is needed.
 * Never throws — a failed booking must not lose the call record.
 */
export async function bookSlot(
  slotLabel: string,
  attendee: { name: string; email?: string; timeZone?: string },
): Promise<BookingOutcome> {
  const start = resolveSlotStart(slotLabel) ?? undefined;
  if (!config.calApiKey || !config.calEventTypeId) {
    return { via: "logged", start, note: "Cal.com keys not set" };
  }
  if (!start) return { via: "logged", note: `Couldn't read a date/time from "${slotLabel}"` };
  if (!attendee.email) return { via: "logged", start, note: "No attendee email on the lead" };

  try {
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.calApiKey}`,
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify({
        start,
        eventTypeId: Number(config.calEventTypeId),
        attendee: {
          name: attendee.name,
          email: attendee.email,
          timeZone: attendee.timeZone ?? "Asia/Kolkata",
        },
        metadata: { source: "lipi-voice-agent" },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      data?: { uid?: string; id?: number | string };
      error?: { message?: string } | string;
    };
    if (!res.ok || body.status === "error") {
      const detail = typeof body.error === "string" ? body.error : body.error?.message;
      return { via: "logged", start, note: `Cal.com ${res.status}: ${detail ?? "booking rejected"}` };
    }
    return {
      via: "cal.com",
      start,
      uid: String(body.data?.uid ?? body.data?.id ?? ""),
      emailedTo: attendee.email,
    };
  } catch (error) {
    return { via: "logged", start, note: error instanceof Error ? error.message : "Cal.com unreachable" };
  }
}
