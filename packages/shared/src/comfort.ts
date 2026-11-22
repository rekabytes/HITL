import type { ThermalVote } from "./schemas";

export interface ComfortBands {
  tempMinC: number;
  tempMaxC: number;
  humidityMinPct: number;
  humidityMaxPct: number;
  /** CO2 above this: ventilation is falling behind, advise more fresh air. */
  co2WarnPpm: number;
  /** CO2 above this: poor air, raise an alert. */
  co2HighPpm: number;
}

/**
 * Tropical defaults: Malaysian offices are usually set around 24 °C.
 * CO2: outdoor air is about 420 ppm; 1000 ppm is the common "ventilate more"
 * guideline for occupied rooms, and above 1500 ppm people report stuffiness
 * and drowsiness.
 */
export const DEFAULT_BANDS: ComfortBands = {
  tempMinC: 23,
  tempMaxC: 26,
  humidityMinPct: 40,
  humidityMaxPct: 70,
  co2WarnPpm: 1000,
  co2HighPpm: 1500,
};

/** Advice for a room's current CO2 level, or null when the air is fine. */
export function co2Advice(co2Ppm: number, bands: ComfortBands): { level: "advice" | "action"; item: string } | null {
  if (co2Ppm >= bands.co2HighPpm) {
    return {
      level: "action",
      item: `CO₂ is ${Math.round(co2Ppm)} ppm, above ${bands.co2HighPpm} ppm. The air is stale: open doors or windows, or raise the fresh-air supply.`,
    };
  }
  if (co2Ppm >= bands.co2WarnPpm) {
    return {
      level: "advice",
      item: `CO₂ is ${Math.round(co2Ppm)} ppm, above ${bands.co2WarnPpm} ppm. Ventilation is falling behind the number of people in the room.`,
    };
  }
  return null;
}

/**
 * Rough share of extra cooling per degree a room is kept colder than needed.
 * Common facility rule of thumb is 6 to 10% per °C of setpoint; 7% is used here.
 */
export const COOLING_PCT_PER_DEGREE = 7;

export interface EnergyEstimate {
  /** "overcooling": colder than the comfort band. "ok": inside or above it. */
  status: "ok" | "overcooling";
  /** Degrees below the bottom of the comfort band, 0 when not overcooling. */
  degreesBelow: number;
  /** Estimated extra cooling energy versus running at the bottom of the band. */
  extraCoolingPct: number;
  /** 1 when no cooling is wasted, falling toward 0 as overcooling grows. */
  score: number;
}

/**
 * Estimates wasted cooling from overcooling. It is an estimate from the room
 * temperature alone, not a meter reading: it says nothing about rooms that run
 * too warm, which cost comfort rather than energy.
 */
export function energyEstimate(temperatureC: number, bands: ComfortBands): EnergyEstimate {
  const degreesBelow = Math.max(0, bands.tempMinC - temperatureC);
  const extraCoolingPct = Math.round(degreesBelow * COOLING_PCT_PER_DEGREE);
  return {
    status: degreesBelow > 0 ? "overcooling" : "ok",
    degreesBelow: Math.round(degreesBelow * 10) / 10,
    extraCoolingPct,
    score: Math.max(0, Math.round((1 - extraCoolingPct / 100) * 100) / 100),
  };
}

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
    const e = energyEstimate(temperatureC, bands);
    items.push(
      `Temperature ${temperatureC.toFixed(1)} °C is below ${bands.tempMinC} °C. Raising the setpoint by ${e.degreesBelow} °C would save about ${e.extraCoolingPct}% of cooling energy.`,
    );
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
