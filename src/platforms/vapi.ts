import { config } from "../config.js";
import { buildSystemPrompt } from "../script/prompt.js";
import type { Lead } from "../types.js";
import { routeVoice } from "../voice/routing.js";

const VAPI = "https://api.vapi.ai";

function authHeaders(): HeadersInit {
  if (!config.vapiApiKey) {
    throw new Error("VAPI_API_KEY is missing. Use npm run sim until the platform key is set.");
  }
  return {
    Authorization: `Bearer ${config.vapiApiKey}`,
    "Content-Type": "application/json",
  };
}

export function assistantPayload(lead: Lead) {
  const voice = routeVoice(lead.preferred_language);
  return {
    name: `Lipi V1 · ${lead.company_name}`,
    firstMessage: undefined,
    model: {
      provider: "anthropic",
      model: config.anthropicModel,
      messages: [{ role: "system", content: buildSystemPrompt(lead) }],
      tools: [
        {
          type: "function",
          function: {
            name: "book_meeting",
            description: "Book a founder demo when the prospect picks a concrete slot.",
            parameters: {
              type: "object",
              properties: {
                slot: { type: "string" },
                notes: { type: "string" },
              },
              required: ["slot"],
            },
          },
        },
      ],
    },
    voice: {
      provider: voice.provider,
      voiceId: voice.voiceId || "default",
    },
    voicemailDetectionEnabled: true,
    endCallFunctionEnabled: true,
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: lead.preferred_language === "en-US" ? "en" : "multi",
    },
    serverUrl: `${config.publicBaseUrl}/webhooks/vapi`,
    metadata: {
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      preferred_language: lead.preferred_language,
    },
  };
}

export async function placeOutboundCall(lead: Lead): Promise<{ id: string; status: string }> {
  if (!config.vapiPhoneNumberId) {
    throw new Error("VAPI_PHONE_NUMBER_ID is missing.");
  }

  const res = await fetch(`${VAPI}/call/phone`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      phoneNumberId: config.vapiPhoneNumberId,
      customer: {
        number: lead.contact_number,
        name: lead.contact_name,
      },
      assistant: assistantPayload(lead),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi call failed (${res.status}): ${body}`);
  }

  return (await res.json()) as { id: string; status: string };
}

export function isConfigured(): boolean {
  return Boolean(config.vapiApiKey && config.vapiPhoneNumberId);
}
