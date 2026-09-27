import { Router } from "express";
import { config } from "../config.js";
import { loadCalls, loadLeads } from "../leads/store.js";
import { getScript } from "../script/scriptFile.js";
import { loadIndex } from "../rag/store.js";

export const dashboardRouter = Router();

/** Every question callers have asked across saved calls, and which FAQ entry answered it. */
dashboardRouter.get("/api/questions", async (_req, res) => {
  const calls = await loadCalls();
  const rows = calls.flatMap((call) =>
    (call.questions_asked ?? []).map((q) => ({
      ...q,
      callId: call.call_id,
      contactName: call.lead?.contact_name ?? "",
    })),
  );
  rows.sort((a, b) => b.at.localeCompare(a.at));
  res.json(rows);
});

dashboardRouter.get("/api/bookings", async (_req, res) => {
  const calls = await loadCalls();
  res.json(
    calls
      .filter((call) => call.meeting_details)
      .map((call) => ({
        callId: call.call_id,
        at: call.timestamp,
        contactName: call.lead?.contact_name ?? "",
        companyName: call.lead?.company_name ?? "",
        meeting: call.meeting_details,
        disposition: call.disposition,
      })),
  );
});

/** The script itself, for the dashboard's Script tab. */
dashboardRouter.get("/api/script", async (_req, res) => {
  const index = await loadIndex();
  res.json({
    path: config.scriptPath,
    script: getScript(),
    rag: index ? { source: index.source, chunks: index.chunks.length, model: index.model, createdAt: index.createdAt } : null,
  });
});

dashboardRouter.get("/api/dashboard", async (_req, res) => {
  const [calls, leads, index] = await Promise.all([loadCalls(), loadLeads(), loadIndex()]);
  const questions = calls.flatMap((call) => call.questions_asked ?? []);
  const unanswered = questions.filter((q) => !q.faqId);
  const booked = calls.filter((call) => call.disposition === "Meeting Booked" || call.meeting_details);
  res.json({
    company: {
      id: config.companyId,
      name: config.companyName,
      founder: config.founderName,
    },
    stats: {
      calls: calls.length,
      booked: booked.length,
      leads: leads.length,
      questions: questions.length,
      // Questions the PDF's RAG index had no answer for — run `npm run ingest`
      // again after updating the PDF to grow coverage.
      unanswered: unanswered.length,
      ragChunks: index?.chunks.length ?? 0,
    },
    recentCalls: calls.slice(0, 12),
    bookings: booked.slice(0, 12),
    unansweredQuestions: unanswered.slice(0, 12),
  });
});
