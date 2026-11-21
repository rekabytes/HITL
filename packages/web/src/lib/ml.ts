import type { ThermalVote } from "@hitl/shared";
import { env } from "./env";

export interface PredictInput {
  temperatureC: number;
  humidityPct: number;
  hour: number;
}

export interface Prediction {
  /** Probability that an occupant votes "perfect", 0..1. */
  comfortScore: number;
  predictedVote: ThermalVote;
  model: "random_forest" | "heuristic";
}

export interface TrainRow extends PredictInput {
  vote: ThermalVote;
}

export interface TrainResult {
  status: "succeeded" | "skipped";
  algorithm: string | null;
  rows: number;
  metrics: Record<string, unknown>;
  reason?: string;
}

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (env.mlToken) h.Authorization = `Bearer ${env.mlToken}`;
  return h;
}

/** Returns null when the ml service is down; callers show the rule-based advice alone. */
export async function predict(items: PredictInput[]): Promise<Prediction[] | null> {
  if (items.length === 0) return [];
  try {
    const res = await fetch(`${env.mlUrl}/predict`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        items: items.map((i) => ({ temperature_c: i.temperatureC, humidity_pct: i.humidityPct, hour: i.hour })),
      }),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ml /predict returned ${res.status}`);
    const body = (await res.json()) as {
      predictions: { comfort_score: number; predicted_vote: ThermalVote; model: Prediction["model"] }[];
    };
    return body.predictions.map((p) => ({
      comfortScore: p.comfort_score,
      predictedVote: p.predicted_vote,
      model: p.model,
    }));
  } catch (err) {
    console.warn("[ml] predict failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function train(rows: TrainRow[]): Promise<TrainResult> {
  const res = await fetch(`${env.mlUrl}/train`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      rows: rows.map((r) => ({ temperature_c: r.temperatureC, humidity_pct: r.humidityPct, hour: r.hour, vote: r.vote })),
    }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ml /train returned ${res.status}: ${await res.text()}`);
  return (await res.json()) as TrainResult;
}

export async function mlHealth(): Promise<{ ok: boolean; model?: string; trainedAt?: string | null }> {
  try {
    const res = await fetch(`${env.mlUrl}/health`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { model: string; trained_at: string | null };
    return { ok: true, model: body.model, trainedAt: body.trained_at };
  } catch {
    return { ok: false };
  }
}
