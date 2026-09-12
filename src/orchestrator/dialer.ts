import { addToDnc, isSuppressed, normalizeNumber } from "../compliance/dnc.js";
import { loadLeads } from "../leads/store.js";
import { isConfigured, placeOutboundCall } from "../platforms/vapi.js";
import type { Lead } from "../types.js";
import { routeVoice } from "../voice/routing.js";

export type DialPlan = {
  lead: Lead;
  skip: boolean;
  reason: string | null;
  voice: ReturnType<typeof routeVoice>;
};

export async function planDials(leads?: Lead[]): Promise<DialPlan[]> {
  const list = leads ?? (await loadLeads());
  const plans: DialPlan[] = [];

  for (const lead of list) {
    const voice = routeVoice(lead.preferred_language);
    const number = normalizeNumber(lead.contact_number);

    if (lead.priority_tier === "human") {
      plans.push({ lead, skip: true, reason: "priority_tier=human — founder should dial", voice });
      continue;
    }
    if (await isSuppressed(number)) {
      plans.push({ lead, skip: true, reason: "number is on the DNC suppression list", voice });
      continue;
    }
    plans.push({ lead, skip: false, reason: null, voice });
  }

  return plans.sort((a, b) => {
    const rank = { high: 0, normal: 1, human: 2 };
    return rank[a.lead.priority_tier] - rank[b.lead.priority_tier];
  });
}

export async function dialLead(lead: Lead): Promise<{ dryRun: boolean; id?: string; status: string }> {
  if (await isSuppressed(lead.contact_number)) {
    throw new Error("Blocked by DNC suppression list");
  }
  if (!isConfigured()) {
    return {
      dryRun: true,
      status: "dry-run — set VAPI_API_KEY and VAPI_PHONE_NUMBER_ID to place a real call",
    };
  }
  const placed = await placeOutboundCall(lead);
  return { dryRun: false, id: placed.id, status: placed.status };
}

export async function honorDnc(contactNumber: string): Promise<void> {
  await addToDnc(contactNumber, "requested");
}
