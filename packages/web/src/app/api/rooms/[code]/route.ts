import { eq } from "drizzle-orm";
import { buildings } from "@hitl/db";
import { apiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, problem } from "@/lib/http";
import { findRoomByCode, isFresh, latestReading } from "@/lib/readings";

export const dynamic = "force-dynamic";

/** Any signed-in user: room details and current conditions, used after a QR scan. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  if (!(await apiUser(req))) return problem(401, "Sign in first");
  const { code } = await ctx.params;
  const room = await findRoomByCode(decodeURIComponent(code));
  if (!room) return problem(404, "Room not found");

  const [building] = await db().select({ name: buildings.name }).from(buildings).where(eq(buildings.id, room.buildingId));
  const latest = await latestReading(room.id);
  return json({
    code: room.code,
    name: room.name,
    building: building?.name ?? null,
    floor: room.floor,
    conditions: isFresh(latest)
      ? { temperatureC: latest.temperatureC, humidityPct: latest.humidityPct, recordedAt: latest.recordedAt, sensorCount: latest.sensorCount }
      : null,
  });
}
