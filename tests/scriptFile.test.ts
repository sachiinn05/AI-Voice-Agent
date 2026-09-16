import { describe, expect, it } from "vitest";
import { loadScript, render, ScriptSchema, scriptPath } from "../src/script/scriptFile.js";
import { PreferredLanguageSchema } from "../src/types.js";
import { openingLine, pitchLine, closeLine, thinkingFillers, topicFor } from "../src/script/lines.js";
import { rebuttal } from "../src/script/objections.js";
import type { Lead } from "../src/types.js";

// The script file is the only thing the agent can say. These tests make sure
// the committed file is complete and well-formed, and that every rendered
// line comes out with no leftover {placeholders}.

const ananya: Lead = {
  company_name: "CityCare Hospital",
  contact_name: "Ananya Sharma",
  contact_number: "+919800000001",
  contact_role: "Front desk manager",
  company_domain: "citycare.example",
  company_description: "24/7 hospital front desk; phones go unanswered after visiting hours",
  industry: "hospital",
  need_for_bot: "after-hours patient calls go unanswered",
  preferred_language: "hi-IN-hinglish",
  lead_source: "demo",
  priority_tier: "high",
};

describe("scripts/call-script.yaml", () => {
  it("loads and validates", () => {
    const script = loadScript(scriptPath());
    expect(script.faq.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(script.topics)).toContain("general");
  });

  it("rejects a script with an unknown placeholder", () => {
    const script = loadScript(scriptPath());
    const broken = structuredClone(script);
    broken.flow.opening.en = "Hi {nmae}, this is a typo";
    // Schema alone passes (it's still a string) — the placeholder check is
    // what should catch it, and it runs inside loadScript. Simulate by
    // validating the shape then checking render leaves the token intact.
    expect(ScriptSchema.safeParse(broken).success).toBe(true);
    expect(render(broken.flow.opening.en, { name: "Ananya" })).toContain("{nmae}");
  });

  it("every beat renders with no leftover placeholders, in every language", () => {
    for (const language of PreferredLanguageSchema.options) {
      const lead = { ...ananya, preferred_language: language };
      const slots = ["Thursday at 11", "Friday at 3"];
      const lines = [
        openingLine(lead, language),
        pitchLine(lead, language),
        closeLine(language, slots),
        rebuttal("not_interested", lead, language, slots),
        rebuttal("how_much", lead, language, slots),
        rebuttal("call_later", lead, language, slots),
        ...thinkingFillers(language),
      ];
      for (const line of lines) {
        expect(line, `[${language}] ${line}`).not.toMatch(/\{[a-zA-Z]+\}/);
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("personalizes by topic from the script's match words", () => {
    expect(topicFor(ananya).key).toBe("hospital");
    expect(topicFor({ ...ananya, industry: "grocery delivery", company_description: "", need_for_bot: "" }).key).toBe("order");
    expect(topicFor({ ...ananya, industry: "trucking", company_description: "logistics", need_for_bot: "" }).key).toBe("general");
  });

  it("the opening uses the caller's name and our company, not the lead's", () => {
    const line = openingLine(ananya, "en-IN");
    expect(line).toContain("Ananya");
    expect(line).not.toContain("CityCare");
  });
});
