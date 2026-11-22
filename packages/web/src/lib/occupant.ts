import { desc, eq } from "drizzle-orm";
import { buildings, feedback, rooms } from "@hitl/db";
import { db } from "./db";
import { findRoomByCode, isFresh, latestReading } from "./readings";

export interface RoomConditions {
  temperatureC: number;
  humidityPct: number;
  recordedAt: string;
  sensorCount: number;
}

export interface RoomSummary {
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  /** Null when no sensor in the room reported recently. */
  conditions: RoomConditions | null;
}

/** Room details and current conditions, as the occupant app shows them. Same shape as GET /api/rooms/:code. */
export async function roomSummary(code: string): Promise<RoomSummary | null> {
  const room = await findRoomByCode(code);
  if (!room) return null;
  const [building] = await db().select({ name: buildings.name }).from(buildings).where(eq(buildings.id, room.buildingId));
  const latest = await latestReading(room.id);
  return {
    code: room.code,
    name: room.name,
    building: building?.name ?? null,
    floor: room.floor,
    conditions: isFresh(latest)
      ? { temperatureC: latest.temperatureC, humidityPct: latest.humidityPct, recordedAt: latest.recordedAt, sensorCount: latest.sensorCount }
      : null,
  };
}

/** Code of the room this user voted in most recently, so the home screen can offer it again. */
export async function lastRoomCode(userId: string): Promise<string | null> {
  const [row] = await db()
    .select({ code: rooms.code })
    .from(feedback)
    .innerJoin(rooms, eq(rooms.id, feedback.roomId))
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt))
    .limit(1);
  return row?.code ?? null;
}
