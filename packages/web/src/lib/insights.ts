import { and, desc, eq, inArray } from "drizzle-orm";
import { aiInsights, rooms, users, type AiInsight } from "@hitl/db";
import { db } from "./db";

export interface RoomInsights {
  roomId: string;
  code: string;
  name: string;
  summary: AiInsight | null;
  open: AiInsight[];
  decided: (AiInsight & { decidedByName: string | null })[];
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Latest summary, open suggestions (most urgent first) and recent decisions for each room that has any. */
export async function listInsights(roomIds?: string[]): Promise<RoomInsights[]> {
  const rows = await db()
    .select({ insight: aiInsights, code: rooms.code, name: rooms.name, decidedByName: users.name })
    .from(aiInsights)
    .innerJoin(rooms, eq(rooms.id, aiInsights.roomId))
    .leftJoin(users, eq(users.id, aiInsights.decidedBy))
    .where(roomIds?.length ? inArray(aiInsights.roomId, roomIds) : undefined)
    .orderBy(desc(aiInsights.createdAt));

  const byRoom = new Map<string, RoomInsights>();
  for (const r of rows) {
    const i = r.insight;
    let entry = byRoom.get(i.roomId);
    if (!entry) {
      entry = { roomId: i.roomId, code: r.code, name: r.name, summary: null, open: [], decided: [] };
      byRoom.set(i.roomId, entry);
    }
    if (i.kind === "summary") {
      entry.summary ??= i;
    } else if (i.status === "open") {
      entry.open.push(i);
    } else if (entry.decided.length < 5) {
      entry.decided.push({ ...i, decidedByName: r.decidedByName });
    }
  }
  for (const e of byRoom.values()) e.open.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return [...byRoom.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function openSuggestionCount(): Promise<number> {
  const rows = await db()
    .select({ id: aiInsights.id })
    .from(aiInsights)
    .where(and(eq(aiInsights.kind, "suggestion"), eq(aiInsights.status, "open")));
  return rows.length;
}
