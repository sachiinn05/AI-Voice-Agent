import { describe, expect, it } from "vitest";
import { detectIntent, isContinue, isOffScript } from "../src/script/intent.js";

// Regression test for a stray leading space in the acknowledge regex
// (`| achha` instead of `|achha`) that made a bare "achha" — a very common
// standalone Hinglish acknowledgment — silently fail to match.
describe("detectIntent keyword fallback", () => {
  it("recognizes standalone Hinglish/English acknowledgments", () => {
    for (const word of ["achha", "accha", "haan", "theek", "ok", "bilkul"]) {
      expect(detectIntent(word)).toBe("acknowledge");
    }
  });

  it("recognizes interest and objection phrases", () => {
    expect(detectIntent("not interested")).toBe("not_interested");
    expect(detectIntent("how much does this cost")).toBe("how_much");
    expect(detectIntent("are you an AI")).toBe("is_this_ai");
    expect(detectIntent("stop calling me")).toBe("dnc");
  });

  it("falls back to unclear on empty or unmatched text", () => {
    expect(detectIntent("")).toBe("unclear");
    expect(detectIntent("   ")).toBe("unclear");
  });

  it("isContinue/isOffScript classify the right intents", () => {
    expect(isContinue("acknowledge")).toBe(true);
    expect(isContinue("interested")).toBe(true);
    expect(isContinue("not_interested")).toBe(false);

    expect(isOffScript("unclear")).toBe(true);
    expect(isOffScript("voicemail")).toBe(true);
    expect(isOffScript("gatekeeper")).toBe(true);
    expect(isOffScript("acknowledge")).toBe(false);
  });
});
