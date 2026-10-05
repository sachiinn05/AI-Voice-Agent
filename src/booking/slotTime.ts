const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const IST_OFFSET_MIN = 330;

/**
 * Turn a spoken slot label ("Tuesday at 3", "Wednesday 11 baje", "Monday 4pm")
 * into a real UTC instant, reading the clock time as India Standard Time.
 * The label has no date, so the weekday resolves to its next occurrence after
 * today. Returns null when the label has no weekday or hour to anchor on.
 */
export function resolveSlotStart(label: string, now: Date = new Date()): string | null {
  const text = label.toLowerCase();
  const weekday = WEEKDAYS.findIndex((d) => text.includes(d));
  const time = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (weekday < 0 || !time) return null;

  let hour = Number(time[1]);
  const minute = Number(time[2] ?? 0);
  if (time[3] === "pm" && hour < 12) hour += 12;
  else if (time[3] === "am" && hour === 12) hour = 0;
  else if (!time[3] && hour >= 1 && hour <= 7) hour += 12; // "3" / "3 baje" means business-hours 3pm
  if (hour > 23 || minute > 59) return null;

  // Work on the IST calendar date, not the server's.
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const daysAhead = ((weekday - ist.getUTCDay() + 7) % 7) || 7;
  const utc = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + daysAhead,
    hour,
    minute,
  ) - IST_OFFSET_MIN * 60_000;
  return new Date(utc).toISOString();
}
