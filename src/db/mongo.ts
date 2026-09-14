import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { config } from "../config.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let lastError = "";

export function mongoConfigured(): boolean {
  return Boolean(config.mongoUri);
}

export function mongoStatus() {
  return {
    configured: mongoConfigured(),
    connected: Boolean(db),
    db: config.mongoDbName,
    lastError,
  };
}

export async function getDb(): Promise<Db> {
  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (db) return db;

  client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(config.mongoDbName);
  lastError = "";
  await ensureIndexes(db).catch((error) => {
    lastError = error instanceof Error ? error.message : "index setup failed";
    console.warn("Mongo index setup:", lastError);
  });
  return db;
}

export async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const database = await getDb();
  return database.collection<T>(name);
}

async function ensureIndexes(database: Db): Promise<void> {
  const chunks = database.collection("knowledge_chunks");
  await chunks.createIndex({ companyId: 1, documentId: 1, chunkIndex: 1 });
  await chunks.createIndex({ companyId: 1, fileName: 1 });

  const documents = database.collection("knowledge_documents");
  await documents.createIndex({ companyId: 1, fileName: 1 }, { unique: true });

  try {
    const existing = await chunks.listSearchIndexes(config.vectorIndexName).toArray();
    if (existing.length) return;
    const dimensions = config.embedding.dimensions || (config.embedding.provider === "local" ? 384 : 1536);
    await chunks.createSearchIndex({
      name: config.vectorIndexName,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: dimensions,
            similarity: "cosine",
          },
          { type: "filter", path: "companyId" },
        ],
      },
    });
    console.log(`Created Atlas vector index ${config.vectorIndexName} (${dimensions} dims)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "vector index skipped";
    console.warn("Atlas vector index not created (in-memory cosine fallback is available):", message);
  }
}

export async function pingMongo(): Promise<boolean> {
  if (!mongoConfigured()) return false;
  try {
    const database = await getDb();
    await database.command({ ping: 1 });
    lastError = "";
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Mongo ping failed";
    db = null;
    client = null;
    return false;
  }
}
