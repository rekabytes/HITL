import { cached, redis, rkey } from "./redis";

/** Fixed-window counter. Returns true when the call is allowed. Fails open if Redis is down. */
export async function rateLimit(bucket: string, limit: number, windowSec: number): Promise<boolean> {
  return cached(async () => {
    const key = rkey.rate(bucket);
    const n = await redis().incr(key);
    if (n === 1) await redis().expire(key, windowSec);
    return n <= limit;
  }, true);
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
