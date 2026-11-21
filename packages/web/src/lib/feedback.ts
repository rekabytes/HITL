import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { feedback, rooms, users } from "@hitl/db";
import type { FeedbackInput, ThermalVote } from "@hitl/shared";
import { checkFeedbackAlerts } from "./alerts";
import { db } from "./db";
import { publish } from "./redis";
import { findRoomByCode, isFresh, latestReading } from "./readings";
import { maybeAutoRetrain } from "./training";

export async function submitFeedback(input: FeedbackInput, userId: string | null, source: "mobile" | "web") {
  const room = await findRoomByCode(input.roomCode);
  if (!room) return { ok: false as const, error: `No room with code ${input.roomCode}` };

  // Pair the vote with the room conditions right now. Without this pairing the vote cannot train the model.
  const latest = await latestReading(room.id);
  const fresh = isFresh(latest);
  const [row] = await db()
    .insert(feedback)
    .values({
      roomId: room.id,
      userId,
      vote: input.vote,
      comfortable: input.comfortable,
      comment: input.comment,
      temperatureC: fresh ? latest.temperatureC : null,
      humidityPct: fresh ? latest.humidityPct : null,
      source,
    })
    .returning();

  await publish({ type: "feedback", roomId: room.id, vote: input.vote, createdAt: row!.createdAt.toISOString() });
  await checkFeedbackAlerts(room.id);
  void maybeAutoRetrain().catch((err) => console.warn("[ml] auto retrain check failed:", err));
  return { ok: true as const, feedback: row!, room };
}

export interface FeedbackFilter {
  roomId?: string;
  vote?: ThermalVote;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function listFeedback(f: FeedbackFilter) {
  const where: SQL[] = [];
  if (f.roomId) where.push(eq(feedback.roomId, f.roomId));
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
