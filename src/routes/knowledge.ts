import { Router } from "express";
import multer from "multer";
import { mongoConfigured, mongoStatus } from "../db/mongo.js";
import { embeddingStatus } from "../embeddings/service.js";
import {
  ingestKnowledgeFolder,
  ingestPdfFile,
  listKnowledgeFiles,
  removeKnowledgeDocument,
  saveUploadedPdf,
} from "../documents/ingest.js";
import { countChunks, listDocuments } from "../rag/vectorStore.js";
import { answerCompanyQuestion } from "../rag/service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are accepted"));
  },
});

export const knowledgeRouter = Router();

knowledgeRouter.get("/api/knowledge", async (_req, res) => {
  const files = await listKnowledgeFiles();
  let documents: Awaited<ReturnType<typeof listDocuments>> = [];
  let chunks = 0;
  try {
    documents = await listDocuments();
    chunks = await countChunks();
  } catch {
    /* dashboard still lists files on disk */
  }
  res.json({
    mongo: mongoStatus(),
    embeddings: embeddingStatus(),
    chunks,
    documents,
    files: files.map((file) => ({
      fileName: file.fileName,
      ingested: documents.some((doc) => doc.fileName === file.fileName),
    })),
  });
});

knowledgeRouter.post("/api/knowledge", upload.array("files", 6), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) {
    res.status(400).json({ error: "Upload one or more PDF files." });
    return;
  }
  if (!mongoConfigured()) {
    res.status(503).json({ error: "Set MONGODB_URI to ingest company PDFs." });
    return;
  }

  const ingested = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const dest = await saveUploadedPdf(file.originalname, file.buffer);
      ingested.push(await ingestPdfFile(dest));
    } catch (error) {
      errors.push(`${file.originalname}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  res.json({ ingested, errors });
});

knowledgeRouter.post("/api/knowledge/ingest", async (_req, res) => {
  try {
    res.json(await ingestKnowledgeFolder());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Ingest failed" });
  }
});

knowledgeRouter.delete("/api/knowledge/:documentId", async (req, res) => {
  try {
    const fileName = typeof req.query.fileName === "string" ? req.query.fileName : undefined;
    await removeKnowledgeDocument(String(req.params.documentId), fileName);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Delete failed" });
  }
});

knowledgeRouter.post("/api/knowledge/ask", async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  const language = req.body?.language === "hi-IN-hinglish" || req.body?.language === "en-US"
    ? req.body.language
    : "en-IN";
  res.json(await answerCompanyQuestion({ question, language }));
});
