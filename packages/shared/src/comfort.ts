import type { ThermalVote } from "./schemas";

export interface ComfortBands {
  tempMinC: number;
  tempMaxC: number;
  humidityMinPct: number;
  humidityMaxPct: number;
}

/** Tropical defaults: Malaysian offices are usually set around 24 °C. */
export const DEFAULT_BANDS: ComfortBands = {
  tempMinC: 23,
  tempMaxC: 26,
  humidityMinPct: 40,
  humidityMaxPct: 70,
};

export interface FeedbackTally {
  tooCold: number;
  perfect: number;
  tooHot: number;
}

export interface RecommendationInput {
  temperatureC: number;
  humidityPct: number;
  bands: ComfortBands;
  /** Votes from the last window (for example 30 minutes). */
  recent?: FeedbackTally;
}

export interface Recommendation {
  level: "ok" | "advice" | "action";
  items: string[];
}

/**
 * Rule-based advice. The ML comfort score is shown next to it, but the
 * advice is plain rules so a facility manager can tell why it says what it says.
 * Occupant votes win over the sensor when enough people agree.
 */
export function recommend({ temperatureC, humidityPct, bands, recent }: RecommendationInput): Recommendation {
  const items: string[] = [];
  let level: Recommendation["level"] = "ok";
  const bump = (to: Recommendation["level"]) => {
    if (to === "action" || (to === "advice" && level === "ok")) level = to;
  };

  const votes = recent ? recent.tooCold + recent.perfect + recent.tooHot : 0;
  const share = (n: number) => (votes > 0 ? n / votes : 0);

  if (recent && votes >= 3 && share(recent.tooHot) >= 0.5) {
    items.push(`${recent.tooHot} of ${votes} recent votes say too hot. Lower the setpoint by 1 °C.`);
    bump("action");
  } else if (recent && votes >= 3 && share(recent.tooCold) >= 0.5) {
    items.push(`${recent.tooCold} of ${votes} recent votes say too cold. Raise the setpoint by 1 °C.`);
    bump("action");
  } else if (temperatureC > bands.tempMaxC) {
    items.push(`Temperature ${temperatureC.toFixed(1)} °C is above ${bands.tempMaxC} °C. Check the air conditioning.`);
    bump("advice");
  } else if (temperatureC < bands.tempMinC) {
    items.push(`Temperature ${temperatureC.toFixed(1)} °C is below ${bands.tempMinC} °C. Raise the setpoint to save energy.`);
    bump("advice");
  }

  if (humidityPct > bands.humidityMaxPct) {
    items.push(`Humidity ${humidityPct.toFixed(0)}% is above ${bands.humidityMaxPct}%. Turn on dehumidify mode or check for leaks.`);
    bump("advice");
  } else if (humidityPct < bands.humidityMinPct) {
    items.push(`Humidity ${humidityPct.toFixed(0)}% is below ${bands.humidityMinPct}%. Air may feel dry.`);
    bump("advice");
  }

  if (items.length === 0) items.push("Conditions are inside the comfort band.");
  return { level, items };
}

export function tally(votes: Iterable<ThermalVote>): FeedbackTally {
  const t: FeedbackTally = { tooCold: 0, perfect: 0, tooHot: 0 };
  for (const v of votes) {
    if (v === "too_cold") t.tooCold++;
    else if (v === "perfect") t.perfect++;
    else t.tooHot++;
  }
  return t;
}

/** Map the old Mongo labels ("Too Hot", "Perfect", ...) to the new enum. */
export function parseLegacyVote(raw: unknown): ThermalVote | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "too_cold" || s === "perfect" || s === "too_hot") return s;
  return null;
}
