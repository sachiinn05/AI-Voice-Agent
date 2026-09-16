import { describe, expect, it } from "vitest";
import { classifyRoute, looksLikeQuestion } from "../src/conversation/router.js";
import { detectIntent } from "../src/script/intent.js";
import { mentionsOfferedSlot, pickSlot } from "../src/script/stateMachine.js";

// Each case here is lifted from a real call in data/calls.json that went
// wrong. If one of these regresses, a real caller hits the same wall again.

describe("discovery answers are not knowledge questions", () => {
  const statements = [
    "Ham unhen subah call karte hain",            // got: "I don't know, connect to human"
    "Jo call mis Ho Jaate Hain unhen",            // got: DNC-policy paragraph
    "sometime we are unable to handle",           // got: "we can't prescribe medicine…"
    "unhen Ham bad mein call karte hain",
    "raat ko koi nahi uthata phone",
  ];
  it.each(statements)("keeps '%s' on the script even if labelled company_knowledge", (text) => {
    expect(looksLikeQuestion(text)).toBe(false);
    expect(classifyRoute("company_knowledge", text, "CONTEXT_BRIDGE")).toBe("conversation");
  });

  it.each([
    "yah kya available hai Hamare Liye",
    "what services do you offer",
    "kitna cost aayega",
    "do you handle appointment booking",
    "refund policy kya hai",
  ])("still sends a real question '%s' to knowledge", (text) => {
    expect(looksLikeQuestion(text)).toBe(true);
    expect(classifyRoute("company_knowledge", text, "CONTEXT_BRIDGE")).toBe("knowledge");
  });
});

describe("naming an offered slot in CLOSE accepts it", () => {
  const offered = ["Tuesday 11 baje", "Wednesday 3 baje"];
  it.each(["Wednesday", "wednesday theek hai", "11", "Tuesday", "3 baje", "doosra", "the second one", "pehla"])(
    "'%s' counts as picking a slot",
    (text) => expect(mentionsOfferedSlot(text, offered)).toBe(true),
  );
  it("picks the slot actually named (the lost-booking case)", () => {
    expect(pickSlot("Wednesday", offered)).toBe("Wednesday 3 baje");
  });
  it.each(["thoda sochne do", "send me an email", "not sure", "okay"])("'%s' is not a slot pick", (text) =>
    expect(mentionsOfferedSlot(text, offered)).toBe(false),
  );
});

describe("misheard short 'haan' is still an acknowledgment", () => {
  it.each(["han", "ham", "hn", "hain", "haa", "han han", "ji haan", "hmm", "okay."])(
    "'%s' alone → acknowledge",
    (text) => expect(detectIntent(text)).toBe("acknowledge"),
  );
  it("does not treat 'ham' inside a sentence as a yes", () => {
    // "ham" here means "we"
    expect(detectIntent("ham unhen subah call karte hain")).not.toBe("acknowledge");
  });
});
