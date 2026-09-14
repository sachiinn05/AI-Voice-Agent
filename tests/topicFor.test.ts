import { describe, expect, it } from "vitest";
import { topicFor } from "../src/script/lines.js";
import type { Lead } from "../src/types.js";

function lead(overrides: Partial<Lead>): Lead {
  return {
    company_name: "Acme",
    contact_name: "Test Person",
    contact_number: "+911234567890",
    contact_role: "",
    company_domain: "",
    company_description: "",
    industry: "",
    need_for_bot: "",
    preferred_language: "en-IN",
    lead_source: "",
    priority_tier: "normal",
    ...overrides,
  };
}

describe("topicFor", () => {
  it("maps hospital leads to the after-hours patient-calls topic", () => {
    const t = topicFor(lead({ industry: "hospital", company_description: "24/7 hospital front desk" }));
    expect(t.key).toBe("hospital");
    expect(t.noun).toContain("patient");
  });

  it("maps grocery/delivery leads to the order-status topic", () => {
    const t = topicFor(lead({ industry: "grocery delivery", need_for_bot: "where is my order calls" }));
    expect(t.key).toBe("order");
    expect(t.noun).toContain("order");
  });

  it("maps dental/appointment leads to the appointment topic", () => {
    const t = topicFor(lead({ industry: "dental clinic", company_description: "appointment line busy" }));
    expect(t.key).toBe("appointment");
    expect(t.noun).toContain("appointment");
  });

  it("falls back to a general topic for anything else", () => {
    const t = topicFor(lead({ industry: "logistics", company_description: "trucking company" }));
    expect(t.key).toBe("general");
  });
});
