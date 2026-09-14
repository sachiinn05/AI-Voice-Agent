import { Router } from "express";
import { config } from "../config.js";
import { loadCalls, loadLeads } from "../leads/store.js";
import { loadQuestions } from "../leads/questions.js";
import { countChunks, listDocuments } from "../rag/vectorStore.js";

export const dashboardRouter = Router();

dashboardRouter.get("/api/questions", async (_req, res) => {
  res.json(await loadQuestions());
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

dashboardRouter.get("/api/dashboard", async (_req, res) => {
  const [calls, leads, questions] = await Promise.all([loadCalls(), loadLeads(), loadQuestions()]);
  let documents = 0;
  let chunks = 0;
  try {
    documents = (await listDocuments()).length;
    chunks = await countChunks();
  } catch {
    /* knowledge is optional until Mongo is configured */
  }

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
      documents,
      chunks,
    },
    recentCalls: calls.slice(0, 12),
    bookings: booked.slice(0, 12),
    questions: questions.slice(0, 12),
  });
});
