// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain browser ESM, not part of the tsconfig src build
import { looksLikeEcho } from "../public/voice.js";

// Regression test for the barge-in/echo gap: without headphones, the mic can
// pick up the agent's own TTS from the speaker. looksLikeEcho() should
// recognize that as echo (so it doesn't cut the agent off), while still
// letting a genuinely different utterance from the caller through as a real
// barge-in.
describe("looksLikeEcho", () => {
  const agentLine =
    "Thanks. Quick question — how is FreshBasket handling order-status calls flooding your line today?";

  it("recognizes an exact echo of the currently-playing line", () => {
    expect(looksLikeEcho(agentLine, agentLine)).toBe(true);
  });

  it("recognizes a partial echo (STT only caught part of the sentence)", () => {
    expect(looksLikeEcho("how is FreshBasket handling order status calls", agentLine)).toBe(true);
  });

  it("does not flag a genuinely different caller interruption as echo", () => {
    expect(looksLikeEcho("stop, I'm not interested", agentLine)).toBe(false);
    expect(looksLikeEcho("can you send me an email instead", agentLine)).toBe(false);
  });

  it("handles empty input safely", () => {
    expect(looksLikeEcho("", agentLine)).toBe(false);
    expect(looksLikeEcho(agentLine, "")).toBe(false);
  });
});
