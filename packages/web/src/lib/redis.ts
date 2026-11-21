import Redis from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __hitlRedis?: Redis };

export function redis(): Redis {
  if (!g.__hitlRedis) {
    g.__hitlRedis = new Redis(env.redisUrl, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    g.__hitlRedis.on("error", (err) => console.warn("[redis]", err.message));
  }
  return g.__hitlRedis;
}

/** Pub/sub needs its own connection. Callers must `quit()` it. */
export function newSubscriber(): Redis {
  const sub = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  sub.on("error", (err) => console.warn("[redis sub]", err.message));
  return sub;
}

export const LIVE_CHANNEL = "hitl:live";

export const rkey = {
  latest: (roomId: string) => `hitl:room:${roomId}:latest`,
  status: (roomId: string) => `hitl:room:${roomId}:status`,
  session: (tokenHash: string) => `hitl:session:${tokenHash}`,
  rate: (bucket: string) => `hitl:rate:${bucket}`,
  trainLock: "hitl:ml:train-lock",
};

/**
 * Redis is a cache here, never the source of truth. If it is down, log and
 * carry on so sensor ingest and the dashboard keep working from Postgres.
 */
export async function cached<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[redis] skipped:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function publish(event: LiveEvent): Promise<void> {
  await cached(() => redis().publish(LIVE_CHANNEL, JSON.stringify(event)), 0);
}

export type LiveEvent =
  | {
      type: "reading";
      roomId: string;
      temperatureC: number;
      humidityPct: number;
      pressureHpa: number | null;
      recordedAt: string;
    }
  | { type: "feedback"; roomId: string; vote: string; createdAt: string }
  | { type: "alert"; roomId: string | null; kind: string; severity: string; message: string };
