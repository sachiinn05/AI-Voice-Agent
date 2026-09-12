import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";
import { config } from "../config.js";
import { CallResultSchema, LeadSchema, type CallResult, type Lead } from "../types.js";

async function ensureLeadsFile(): Promise<string> {
  if (existsSync(config.leadsPath)) return config.leadsPath;
  const example = path.join(config.root, "data", "leads.example.csv");
  if (existsSync(example)) {
    await mkdir(path.dirname(config.leadsPath), { recursive: true });
    const copy = await readFile(example, "utf8");
    await writeFile(config.leadsPath, copy, "utf8");
    return config.leadsPath;
  }
  throw new Error(`No leads file at ${config.leadsPath}. Copy data/leads.example.csv first.`);
}

export async function loadLeads(): Promise<Lead[]> {
  const file = await ensureLeadsFile();
  const leads: Lead[] = [];
  const parser = createReadStream(file).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true }),
  );

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const parsed = LeadSchema.safeParse({
      ...row,
      priority_tier: row.priority_tier || "normal",
    });
    if (parsed.success) leads.push(parsed.data);
  }
  return leads;
}

export async function loadCalls(): Promise<CallResult[]> {
  if (!existsSync(config.callsPath)) return [];
  const raw = JSON.parse(await readFile(config.callsPath, "utf8")) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => CallResultSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
}

export async function saveCall(result: CallResult): Promise<void> {
  const existing = await loadCalls();
  existing.unshift(result);
  await mkdir(path.dirname(config.callsPath), { recursive: true });
  await writeFile(config.callsPath, JSON.stringify(existing, null, 2), "utf8");
}
