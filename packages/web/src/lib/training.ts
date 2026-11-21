import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { feedback, modelRuns } from "@hitl/db";
import { db } from "./db";
import { env } from "./env";
import { train, type TrainRow } from "./ml";
import { cached, redis, rkey } from "./redis";

/** Retrain on its own once this many new labelled votes have come in since the last good run. */
const AUTO_RETRAIN_EVERY = 50;

/**
 * Trains the comfort model on real occupant votes paired with the room
 * conditions at the time of the vote. This is the human-in-the-loop part:
 * the model learns what people in these rooms call comfortable.
 */
export async function runTraining(): Promise<{ status: string; message: string }> {
  // Redis lock so two triggers never train at once. Without Redis, train anyway.
  const locked = await cached(() => redis().set(rkey.trainLock, "1", "EX", 600, "NX"), "OK");
  if (locked !== "OK") return { status: "busy", message: "A training run is already in progress." };

  const [run] = await db().insert(modelRuns).values({ status: "running" }).returning({ id: modelRuns.id });
  try {
    const rows = await db()
      .select({
        temperatureC: feedback.temperatureC,
        humidityPct: feedback.humidityPct,
        vote: feedback.vote,
        hour: sql<number>`extract(hour from ${feedback.createdAt} at time zone ${env.timeZone})::int`,
      })
      .from(feedback)
      .where(and(isNotNull(feedback.temperatureC), isNotNull(feedback.humidityPct)));

    const result = await train(rows as TrainRow[]);
    await db()
      .update(modelRuns)
      .set({
        status: result.status,
        algorithm: result.algorithm,
        trainingRows: result.rows,
        metrics: result.metrics,
        error: result.reason ?? null,
        finishedAt: new Date(),
      })
      .where(eq(modelRuns.id, run!.id));
    return {
      status: result.status,
      message: result.status === "succeeded" ? `Trained on ${result.rows} votes.` : (result.reason ?? "Skipped."),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().update(modelRuns).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(modelRuns.id, run!.id));
    return { status: "failed", message };
  } finally {
    await cached(() => redis().del(rkey.trainLock), 0);
  }
}

/** Called after each vote. Starts a background run when enough new labelled votes exist. */
export async function maybeAutoRetrain() {
  const [last] = await db()
    .select({ at: modelRuns.startedAt })
    .from(modelRuns)
    // Count from the last finished run, so a "skipped" run (for example only one vote class) is not retried on every vote.
    .where(inArray(modelRuns.status, ["succeeded", "skipped"]))
    .orderBy(desc(modelRuns.startedAt))
    .limit(1);
  const conditions = [isNotNull(feedback.temperatureC)];
  if (last) conditions.push(gt(feedback.createdAt, last.at));
  const [{ n } = { n: 0 }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(...conditions));
  if (n >= AUTO_RETRAIN_EVERY) {
    void runTraining().catch((err) => console.warn("[ml] auto retrain failed:", err));
  }
}
