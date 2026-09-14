import { describe, expect, it } from "vitest";
import { classifyRoute } from "../src/conversation/router.js";
import type { Intent } from "../src/types.js";

// Regression test for the bug where classifyRoute() defaulted every intent
// (including plain "okay") to the RAG "knowledge" route. Without MongoDB
// configured that meant almost every reply in the free-tier setup got
// answered with "I don't have enough information..." instead of actually
// advancing the call.
describe("classifyRoute", () => {
  const ON_SCRIPT_INTENTS: Intent[] = [
    "acknowledge",
    "interested",
    "not_interested",
    "already_use_competitor",
    "how_much",
    "is_this_ai",
    "who_gave_number",
    "call_later",
    "give_availability",
    "unclear",
    "voicemail",
    "gatekeeper",
  ];

  it.each(ON_SCRIPT_INTENTS)("keeps %s on the scripted conversation, not RAG", (intent) => {
    expect(classifyRoute(intent, "okay", "OPENING")).toBe("conversation");
  });

  it("routes an explicit company question to knowledge", () => {
    expect(classifyRoute("company_knowledge", "what's your refund policy?", "PITCH")).toBe("knowledge");
  });

  it("routes an explicit booking request to booking", () => {
    expect(classifyRoute("booking_request", "book me a demo", "PITCH")).toBe("booking");
  });

  it("routes a booking phrase even if intent classification missed it", () => {
    expect(classifyRoute("unclear", "can you schedule a demo", "PITCH")).toBe("booking");
  });

  it("sends dnc/hostile/no_time/wrong_person straight to the scripted exit", () => {
    for (const intent of ["dnc", "hostile", "no_time", "wrong_person"] as Intent[]) {
      expect(classifyRoute(intent, "whatever", "PITCH")).toBe("conversation");
    }
  });

  it("only routes slot intents to booking once the call is in CLOSE", () => {
    expect(classifyRoute("accept_slot", "monday works", "PITCH")).toBe("conversation");
    expect(classifyRoute("accept_slot", "monday works", "CLOSE")).toBe("booking");
  });
});
