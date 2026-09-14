import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getCollection, mongoConfigured } from "../db/mongo.js";
import { KnowledgeQuestionSchema, type KnowledgeQuestion } from "../types.js";

async function readLocal(): Promise<KnowledgeQuestion[]> {
  if (!existsSync(config.questionsPath)) return [];
  try {
    const raw = JSON.parse(await readFile(config.questionsPath, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => KnowledgeQuestionSchema.safeParse(row))
      .filter((row) => row.success)
      .map((row) => row.data);
  } catch {
    return [];
  }
}

async function writeLocal(rows: KnowledgeQuestion[]): Promise<void> {
  await mkdir(path.dirname(config.questionsPath), { recursive: true });
  await writeFile(config.questionsPath, JSON.stringify(rows, null, 2), "utf8");
}

export async function saveQuestion(
  input: Omit<KnowledgeQuestion, "id" | "at"> & { id?: string; at?: string },
): Promise<KnowledgeQuestion> {
  const row: KnowledgeQuestion = {
    id: input.id ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    callId: input.callId,
    contactName: input.contactName,
    question: input.question,
    answer: input.answer,
    sources: input.sources,
    grounded: input.grounded,
  };

  const local = await readLocal();
  local.unshift(row);
  await writeLocal(local.slice(0, 200));

  if (mongoConfigured()) {
    try {
      const col = await getCollection<KnowledgeQuestion>("knowledge_questions");
      await col.insertOne(row);
    } catch (error) {
      console.warn("Could not persist question to Mongo:", error);
    }
  }

  return row;
}

export async function loadQuestions(): Promise<KnowledgeQuestion[]> {
  if (mongoConfigured()) {
    try {
      const col = await getCollection<KnowledgeQuestion>("knowledge_questions");
      const rows = await col.find({}).sort({ at: -1 }).limit(100).toArray();
      if (rows.length) return rows;
    } catch {
      /* use local file */
    }
  }
  return readLocal();
}
