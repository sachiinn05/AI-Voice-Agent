import { describe, expect, it } from "vitest";
import { pickSlot } from "../src/script/stateMachine.js";

// Regression test for the bug where pickSlot() assumed offered slots are
// always ["Monday ...", "Tuesday ..."] and treated the literal word
// "tuesday" as always meaning "the second option". Since
// defaultMeetingSlots() picks the next two real weekdays, that assumption
// silently booked the wrong day whenever the real slots landed on a
// different weekday pair (e.g. Tuesday/Wednesday).
describe("pickSlot", () => {
  it("matches the day actually named, even when it's the first offered slot", () => {
    const options = ["Tuesday at 11", "Wednesday at 3"];
    expect(pickSlot("tuesday works", options)).toBe("Tuesday at 11");
    expect(pickSlot("wednesday is better", options)).toBe("Wednesday at 3");
  });

  it("matches the hour named when no weekday is said", () => {
    const options = ["Tuesday at 11", "Wednesday at 3"];
    expect(pickSlot("let's do 3", options)).toBe("Wednesday at 3");
    expect(pickSlot("11 works for me", options)).toBe("Tuesday at 11");
  });

  it("falls back to ordinal words when the slot text doesn't match directly", () => {
    const options = ["Thursday at 11", "Friday at 3"];
    expect(pickSlot("the first one", options)).toBe("Thursday at 11");
    expect(pickSlot("second please", options)).toBe("Friday at 3");
  });

  it("understands Hinglish ordinals and hour words", () => {
    const options = ["Monday 11 baje", "Tuesday 3 baje"];
    expect(pickSlot("pehla theek hai", options)).toBe("Monday 11 baje");
    expect(pickSlot("doosra wala", options)).toBe("Tuesday 3 baje");
    expect(pickSlot("gyarah baje thik hai", options)).toBe("Monday 11 baje");
  });

  it("defaults to the first option when nothing matches", () => {
    expect(pickSlot("whatever works for you", ["Monday at 11", "Tuesday at 3"])).toBe("Monday at 11");
  });
});
