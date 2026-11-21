import { createDb, type Database } from "@hitl/db";
import { env } from "./env";

const g = globalThis as unknown as { __hitlDb?: Database };

/** One pool per process. The global keeps `next dev` hot reloads from opening new pools. */
export function db(): Database {
  if (!g.__hitlDb) g.__hitlDb = createDb(env.databaseUrl).db;
  return g.__hitlDb;
}
