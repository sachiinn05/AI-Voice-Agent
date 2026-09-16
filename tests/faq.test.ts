import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Lead } from "../src/types.js";

// "RAG on the script": a caller's question must land on the right FAQ entry
// from scripts/call-script.yaml — and a question the script doesn't cover
// must return null, so the agent pivots instead of guessing.
//
// The key is cleared BEFORE the module graph loads (config reads env at
// import time), so these exercise the local matcher alone — no network.
// That's also the path CI takes, where no key exists.
let answerFromScript: typeof import("../src/script/faq.js")["answerFromScript"];
let resetFaqIndex: typeof import("../src/script/faq.js")["resetFaqIndex"];

beforeAll(async () => {
  process.env.GROQ_API_KEY = "";
  ({ answerFromScript, resetFaqIndex } = await import("../src/script/faq.js"));
});

const rohan: Lead = {
  company_name: "FreshBasket",
  contact_name: "Rohan Mehta",
  contact_number: "+919800000002",
  contact_role: "Operations lead",
  company_domain: "freshbasket.example",
  company_description: "online grocery delivery app; support line gets flooded with order-status calls",
  industry: "grocery delivery",
  need_for_bot: "customers keep calling just to ask where is my order",
  preferred_language: "en-IN",
  lead_source: "demo",
  priority_tier: "normal",
  gender: "male",
};

beforeEach(() => {
  resetFaqIndex();
});

describe("answerFromScript", () => {
  it.each([
    ["how much does it cost", "pricing"],
    ["what is the price", "pricing"],
    ["kitna kharcha aayega", "pricing"],
    ["does it speak hindi", "languages"],
    ["can it transfer to a person", "handoff"],
    ["do we need to change our number", "integration"],
    ["is the data safe", "privacy"],
    ["what is this about", "what_is_it"],
    ["can it book appointments", "booking"],
    ["is there a contract", "contract"],
  ])("'%s' → %s", async (question, expectedId) => {
    const match = await answerFromScript(question, rohan, "en-IN");
    expect(match?.id).toBe(expectedId);
    expect(match?.answer).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("fills the answer with the lead's topic and our company", async () => {
    const match = await answerFromScript("how much does it cost", rohan, "en-IN");
    expect(match?.answer).toContain("order-status calls");
  });

  it("answers in Hinglish for a Hinglish caller", async () => {
    const match = await answerFromScript("kitna kharcha aayega", { ...rohan, preferred_language: "hi-IN-hinglish" }, "hi-IN-hinglish");
    expect(match?.id).toBe("pricing");
    expect(match?.answer).toMatch(/pricing|kharcha|number/i);
  });

  it("returns null for something the script doesn't cover", async () => {
    for (const q of [
      "what's the weather like in mumbai",
      "who won the cricket match",
      "tell me a joke",
      "are you married",
      "what time is it", // one shared word ("time") must not be enough
    ]) {
      expect(await answerFromScript(q, rohan, "en-IN"), q).toBeNull();
    }
  });

  it("still matches a phrasing made entirely of function words", async () => {
    expect((await answerFromScript("what is this about", rohan, "en-IN"))?.id).toBe("what_is_it");
    expect((await answerFromScript("aap kaun ho", rohan, "hi-IN-hinglish"))?.id).toBe("who_are_you");
  });
});
