import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { mlHealth } from "@/lib/ml";
import { cached, redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, cache, ml] = await Promise.all([
    db()
      .execute(sql`select 1`)
      .then(() => true)
      .catch(() => false),
    cached(() => redis().ping().then((p) => p === "PONG"), false),
    mlHealth(),
  ]);
  return json({ status: database ? "ok" : "degraded", database, redis: cache, ml }, database ? 200 : 503);
}
