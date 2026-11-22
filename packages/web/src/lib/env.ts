import type { ComfortBands } from "@hitl/shared";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. Run \`pnpm env:setup\` or check your .env.`);
  return v;
}

function number(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== "" ? n : fallback;
}

// Getters so nothing is read at import time; `next build` runs without a database.
export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get redisUrl() {
    return process.env.REDIS_URL?.trim() || "redis://localhost:6379";
  },
  get authSecret() {
    const s = required("AUTH_SECRET");
    if (s.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be at least 32 characters in production");
    }
    return s;
  },
  get appUrl() {
    return process.env.APP_URL?.trim() || "http://localhost:3000";
  },
  get mlUrl() {
    return process.env.ML_URL?.trim() || "http://localhost:8000";
  },
  get mlToken() {
    return process.env.ML_TOKEN?.trim() || "";
  },
  /** Used for the "hour of day" model feature and for display. */
  get timeZone() {
    return process.env.TZ_DISPLAY?.trim() || "Asia/Kuala_Lumpur";
  },
  get bands(): ComfortBands {
    return {
      tempMinC: number("COMFORT_TEMP_MIN_C", 23),
      tempMaxC: number("COMFORT_TEMP_MAX_C", 26),
      humidityMinPct: number("COMFORT_HUMIDITY_MIN_PCT", 40),
      humidityMaxPct: number("COMFORT_HUMIDITY_MAX_PCT", 70),
      co2WarnPpm: number("CO2_WARN_PPM", 1000),
      co2HighPpm: number("CO2_HIGH_PPM", 1500),
    };
  },
  /** Open, unacknowledged alerts older than this are escalated to critical and emailed again. */
  get escalateAfterMin() {
    return Math.max(1, number("ALERT_ESCALATE_AFTER_MIN", 5));
  },
  get smtp() {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) return null;
    return {
      host,
      port: number("SMTP_PORT", 587),
      user: process.env.SMTP_USER?.trim() || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      from: process.env.SMTP_FROM?.trim() || "hitl@localhost",
    };
  },
};
