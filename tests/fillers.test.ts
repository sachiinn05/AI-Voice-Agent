import { describe, expect, it } from "vitest";
import { thinkingFillers } from "../src/script/lines.js";
import { PreferredLanguageSchema } from "../src/types.js";

// The backchannels are what the agent says the instant the caller stops
// talking, while the real reply is still generating. They're pre-synthesized
// into the TTS cache at startup, so the set must stay small, fixed, and
// defined for every supported language — otherwise a call falls back to
// silence during the 2-4s the LLM + TTS need.
describe("thinkingFillers", () => {
  it.each(PreferredLanguageSchema.options)("returns usable backchannels for %s", (language) => {
    const fillers = thinkingFillers(language);
    expect(fillers.length).toBeGreaterThanOrEqual(2);
    for (const filler of fillers) {
      expect(filler.trim().length).toBeGreaterThan(0);
      // Long fillers defeat the purpose — they'd outlast the reply itself.
      expect(filler.split(/\s+/).length).toBeLessThanOrEqual(5);
    }
  });

  it("gives Hinglish its own backchannels, not the English ones", () => {
    expect(thinkingFillers("hi-IN-hinglish")).not.toEqual(thinkingFillers("en-US"));
  });

  it("has no duplicates, so consecutive replies can vary", () => {
    for (const language of PreferredLanguageSchema.options) {
      const fillers = thinkingFillers(language);
      expect(new Set(fillers).size).toBe(fillers.length);
    }
  });
});
