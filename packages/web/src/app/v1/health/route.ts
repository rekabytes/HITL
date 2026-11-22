import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { mlHealth } from "@/lib/ml";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cached, redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await rateLimit(`public-v1-health:${clientIp(req.headers)}`, 60, 60))) {
    return json({ error: "Too many requests, slow down" }, 429);
  }

  const checkedAt = new Date().toISOString();
  const [database, cache, ml] = await Promise.all([
    db().execute(sql`select 1`).then(() => true).catch(() => false),
    cached(() => redis().ping().then((p) => p === "PONG"), false),
    mlHealth(),
  ]);
  const status = database ? "ok" : "degraded";
  return json({
    status,
    timestamp: checkedAt,
    services: {
      database: { status: database ? "up" : "down" },
      redis: { status: cache ? "up" : "down" },
      ml: { status: ml.ok ? "up" : "down", model: ml.model ?? null, trainedAt: ml.trainedAt ?? null },
    },
  }, database ? 200 : 503);
}
