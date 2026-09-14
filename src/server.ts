import express from "express";
import path from "node:path";
import { bookSlot } from "./booking/calendar.js";
import { honorDnc } from "./orchestrator/dialer.js";
import { config } from "./config.js";
import { addToDnc } from "./compliance/dnc.js";
import { scoreCall } from "./dispo/scorer.js";
import { loadCalls, loadLeads, saveCall } from "./leads/store.js";
import { planDials, dialLead } from "./orchestrator/dialer.js";
import { handleTurn } from "./conversation/turn.js";
import { pingMongo, mongoStatus } from "./db/mongo.js";
import { embeddingStatus } from "./embeddings/service.js";
import { groqEnabled, groqStatus } from "./llm/groq.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { createSession, nudge, startCall } from "./script/stateMachine.js";
import { LeadSchema, type Session } from "./types.js";
import { synthesizeSpeech } from "./tts.js";
import { describeRouting, routeVoice } from "./voice/routing.js";

const sessions = new Map<string, Session>();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(config.root, "public")));
app.use(knowledgeRouter);
app.use(dashboardRouter);

app.get("/api/health", async (_req, res) => {
  const mongo = mongoStatus();
  if (mongo.configured) await pingMongo();
  res.json({
    ok: true,
    product: "Lipi.ai one-company voice agent",
    approach: "existing script + RAG for company knowledge",
    company: { id: config.companyId, name: config.companyName },
    voiceRouting: describeRouting(),
    groq: groqStatus(),
    mongo: mongoStatus(),
    embeddings: embeddingStatus(),
  });
});

app.get("/api/leads", async (_req, res) => {
  res.json(await loadLeads());
});

app.get("/api/calls", async (_req, res) => {
  res.json(await loadCalls());
});

app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text ?? "");
  const language = String(req.body?.language ?? "en-IN");
  try {
    const audio = await synthesizeSpeech(text, language);
    res.setHeader("Content-Type", audio.type);
    res.setHeader("Cache-Control", "no-store");
    res.send(audio.buffer);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "TTS failed",
    });
  }
});

app.get("/api/routing", (_req, res) => {
  res.json({
    "en-US": routeVoice("en-US"),
    "en-IN": routeVoice("en-IN"),
    "hi-IN-hinglish": routeVoice("hi-IN-hinglish"),
    note: describeRouting(),
  });
});

app.post("/api/simulate/start", async (req, res) => {
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const session = createSession(parsed.data);
  const opening = startCall(session);
  sessions.set(session.callId, session);
  res.json({
    callId: session.callId,
    state: session.state,
    agent: opening,
    ended: session.ended,
    language: session.lead.preferred_language,
    voice: routeVoice(session.lead.preferred_language),
    via: "script",
  });
});

app.post("/api/simulate/reply", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const text = String(req.body?.text ?? "");
  const session = sessions.get(callId);
  if (!session) {
    res.status(404).json({ error: "Unknown callId. Start a simulation first." });
    return;
  }
  const turn = await handleTurn(session, text);
  let result = null;
  if (session.ended) {
    result = await scoreCall(session);
    if (result.compliance_flags.includes("do_not_call_requested")) {
      await addToDnc(session.lead.contact_number, "requested");
    }
    if (session.meetingSlot) {
      await bookSlot(session.meetingSlot, session.lead.contact_name);
    }
    await saveCall(result);
    sessions.delete(callId);
  }
  res.json({
    callId,
    state: session.state,
    agent: turn.agent,
    ended: session.ended,
    objectionsRaised: session.objectionsRaised,
    result,
    via: turn.via,
    intent: turn.intent,
    route: turn.route,
    sources: turn.sources,
  });
});

app.post("/api/simulate/nudge", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const session = sessions.get(callId);
  if (!session) {
    res.status(404).json({ error: "Unknown callId." });
    return;
  }
  const agent = nudge(session);
  let result = null;
  if (session.ended) {
    result = await scoreCall(session);
    await saveCall(result);
    sessions.delete(callId);
  }
  res.json({
    callId,
    state: session.state,
    agent,
    ended: session.ended,
    result,
    via: "script",
  });
});

app.post("/api/simulate/hangup", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const session = sessions.get(callId);
  if (!session) {
    res.status(404).json({ error: "Unknown callId." });
    return;
  }
  session.ended = true;
  session.state = "ENDED";
  const result = await scoreCall(session);
  if (result.compliance_flags.includes("do_not_call_requested")) {
    await addToDnc(session.lead.contact_number, "requested");
  }
  await saveCall(result);
  sessions.delete(callId);
  res.json({ callId, ended: true, result });
});

app.post("/api/dial", async (req, res) => {
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const outcome = await dialLead(parsed.data);
    res.json({ lead: parsed.data, voice: routeVoice(parsed.data.preferred_language), ...outcome });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Dial failed" });
  }
});

app.get("/api/dial/plan", async (_req, res) => {
  res.json(await planDials());
});

app.post("/webhooks/vapi", async (req, res) => {
  const body = req.body as {
    message?: {
      type?: string;
      call?: { id?: string; customer?: { number?: string } };
      artifact?: { transcript?: string };
      analysis?: { summary?: string };
    };
    lead?: unknown;
  };

  if (body.message?.type && body.message.type !== "end-of-call-report") {
    res.json({ ok: true });
    return;
  }

  const transcript = body.message?.artifact?.transcript ?? "";
  if (/\b(do not call|don't call|opt[- ]?out)\b/i.test(transcript)) {
    const number = body.message?.call?.customer?.number;
    if (number) await honorDnc(number);
  }

  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`Lipi.ai V1 running at http://localhost:${config.port}`);
  console.log("Voice agent: open the dashboard, press Call, allow the mic, and talk.");
  console.log(groqEnabled() ? "Groq is on — it classifies intent; the script speaks." : "Groq is off — keyword intent + scripted lines.");
  console.log("Real dials need VAPI_API_KEY + VAPI_PHONE_NUMBER_ID.");
});
