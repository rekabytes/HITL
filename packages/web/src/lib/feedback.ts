import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { feedback, rooms, users } from "@hitl/db";
import type { FeedbackInput, ThermalVote } from "@hitl/shared";
import { checkFeedbackAlerts } from "./alerts";
import { db } from "./db";
import { publish } from "./redis";
import { findRoomByCode, isFresh, latestReading, readingAt } from "./readings";
import { maybeAutoRetrain } from "./training";

/** Votes queued offline for longer than this are refused; the conditions they describe are too old to matter. */
const MAX_QUEUED_AGE_MS = 7 * 86_400_000;
/** A vote that arrives within this of being cast counts as live and uses the current reading. */
const LIVE_SLACK_MS = 2 * 60_000;

export async function submitFeedback(input: FeedbackInput, userId: string | null, source: "mobile" | "web") {
  const room = await findRoomByCode(input.roomCode);
  if (!room) return { ok: false as const, status: 404, error: `No room with code ${input.roomCode}` };

  const now = Date.now();
  // A clock running ahead on the phone must not put votes in the future.
  const castAt = input.votedAt ? Math.min(new Date(input.votedAt).getTime(), now) : now;
  if (now - castAt > MAX_QUEUED_AGE_MS) {
    return { ok: false as const, status: 422, error: "This vote is more than 7 days old and was not stored." };
  }
  const late = now - castAt > LIVE_SLACK_MS;

  // Pair the vote with the room conditions when it was cast. Without this pairing the vote cannot train the model.
  let conditions: { temperatureC: number; humidityPct: number } | null;
  if (late) {
    conditions = await readingAt(room.id, new Date(castAt));
  } else {
    const latest = await latestReading(room.id);
    conditions = isFresh(latest) ? latest : null;
  }
  const [row] = await db()
    .insert(feedback)
    .values({
      roomId: room.id,
      userId,
      vote: input.vote,
      comfortable: input.comfortable,
      comment: input.comment,
      temperatureC: conditions?.temperatureC ?? null,
      humidityPct: conditions?.humidityPct ?? null,
      source,
      ...(late ? { createdAt: new Date(castAt) } : {}),
    })
    .returning();

  await publish({ type: "feedback", roomId: room.id, vote: input.vote, createdAt: row!.createdAt.toISOString() });
  await checkFeedbackAlerts(room.id);
  void maybeAutoRetrain().catch((err) => console.warn("[ml] auto retrain check failed:", err));
  return { ok: true as const, feedback: row!, room };
}

export interface FeedbackFilter {
  roomId?: string;
  userId?: string;
  vote?: ThermalVote;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function listFeedback(f: FeedbackFilter) {
  const where: SQL[] = [];
  if (f.roomId) where.push(eq(feedback.roomId, f.roomId));
  if (f.userId) where.push(eq(feedback.userId, f.userId));
  if (f.vote) where.push(eq(feedback.vote, f.vote));
  if (f.from) where.push(gte(feedback.createdAt, f.from));
  if (f.to) where.push(lte(feedback.createdAt, f.to));
  return db()
    .select({
      id: feedback.id,
      createdAt: feedback.createdAt,
      vote: feedback.vote,
      comfortable: feedback.comfortable,
      comment: feedback.comment,
      temperatureC: feedback.temperatureC,
      humidityPct: feedback.humidityPct,
      source: feedback.source,
      roomCode: rooms.code,
      roomName: rooms.name,
      userName: users.name,
    })
    .from(feedback)
    .innerJoin(rooms, eq(rooms.id, feedback.roomId))
    .leftJoin(users, eq(users.id, feedback.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);
}
