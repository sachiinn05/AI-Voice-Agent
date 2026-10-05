import { describe, expect, it } from "vitest";
import { resolveSlotStart } from "../src/booking/slotTime.js";

// Monday 2026-10-05 10:00 UTC (15:30 IST)
const now = new Date("2026-10-05T10:00:00Z");

describe("resolveSlotStart", () => {
  it("reads 'Tuesday at 3' as 3pm IST the next day", () => {
    expect(resolveSlotStart("Tuesday at 3", now)).toBe("2026-10-06T09:30:00.000Z");
  });
  it("reads Hinglish 'Wednesday 11 baje' as 11am IST", () => {
    expect(resolveSlotStart("Wednesday 11 baje", now)).toBe("2026-10-07T05:30:00.000Z");
  });
  it("honours explicit am/pm", () => {
    expect(resolveSlotStart("Friday 4pm", now)).toBe("2026-10-09T10:30:00.000Z");
  });
  it("same weekday means next week, not today", () => {
    expect(resolveSlotStart("Monday at 11", now)).toBe("2026-10-12T05:30:00.000Z");
  });
  it("returns null with no weekday or hour", () => {
    expect(resolveSlotStart("sometime soon", now)).toBeNull();
  });
});
