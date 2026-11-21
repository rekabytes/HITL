import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(url: string, opts: { max?: number } = {}): { db: Database; sql: postgres.Sql } {
  const sql = postgres(url, { max: opts.max ?? 10, prepare: true });
  return { db: drizzle(sql, { schema, casing: "snake_case" }), sql };
}
