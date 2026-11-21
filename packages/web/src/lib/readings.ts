import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { buildings, feedback, rooms, sensorReadings, sensors, type Room, type Sensor } from "@hitl/db";
import { recommend, type FeedbackTally, type Recommendation, type SensorReadingInput } from "@hitl/shared";
import { checkReadingAlerts } from "./alerts";
import { db } from "./db";
import { env } from "./env";
import { predict, type Prediction } from "./ml";
import { cached, publish, redis, rkey } from "./redis";
import { hourIn } from "./time";

export interface LatestReading {
  roomId: string;
  temperatureC: number;
  humidityPct: number;
  pressureHpa: number | null;
  recordedAt: string;
}

const LATEST_TTL_SEC = 15 * 60;
const STATUS_TTL_SEC = 30;
/** A reading older than this is too stale to pair with a vote or to advise on. */
export const FRESH_MIN = 30;

export async function ingestReading(sensor: Sensor, input: SensorReadingInput) {
  const recordedAt = new Date();
  await db().insert(sensorReadings).values({
    sensorId: sensor.id,
    roomId: sensor.roomId,
    temperatureC: input.temperature,
    humidityPct: input.humidity,
    pressureHpa: input.pressure ?? null,
    recordedAt,
  });
  await db().update(sensors).set({ lastSeenAt: recordedAt }).where(eq(sensors.id, sensor.id));
  if (!sensor.roomId) return { roomId: null };

  const latest: LatestReading = {
    roomId: sensor.roomId,
    temperatureC: input.temperature,
    humidityPct: input.humidity,
    pressureHpa: input.pressure ?? null,
    recordedAt: recordedAt.toISOString(),
  };
  await cached(
    () => redis().multi().set(rkey.latest(sensor.roomId!), JSON.stringify(latest), "EX", LATEST_TTL_SEC).del(rkey.status(sensor.roomId!)).exec(),
    null,
  );
  await publish({ type: "reading", ...latest });
  await checkReadingAlerts(sensor.roomId, input.temperature, input.humidity);
  return { roomId: sensor.roomId };
}

export async function latestReading(roomId: string): Promise<LatestReading | null> {
  const hit = await cached(() => redis().get(rkey.latest(roomId)), null);
  if (hit) return JSON.parse(hit) as LatestReading;
  const [row] = await db()
    .select()
    .from(sensorReadings)
    .where(eq(sensorReadings.roomId, roomId))
    .orderBy(desc(sensorReadings.recordedAt))
    .limit(1);
  if (!row) return null;
  const latest: LatestReading = {
    roomId,
    temperatureC: row.temperatureC,
    humidityPct: row.humidityPct,
    pressureHpa: row.pressureHpa,
    recordedAt: row.recordedAt.toISOString(),
  };
  await cached(() => redis().set(rkey.latest(roomId), JSON.stringify(latest), "EX", LATEST_TTL_SEC), null);
  return latest;
}

export function isFresh(r: LatestReading | null): r is LatestReading {
  return !!r && Date.now() - new Date(r.recordedAt).getTime() < FRESH_MIN * 60_000;
}

export async function recentTallies(minutes = 30): Promise<Map<string, FeedbackTally>> {
  const since = new Date(Date.now() - minutes * 60_000);
  const rows = await db()
    .select({ roomId: feedback.roomId, vote: feedback.vote, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(gt(feedback.createdAt, since))
    .groupBy(feedback.roomId, feedback.vote);
  const map = new Map<string, FeedbackTally>();
  for (const r of rows) {
    const t = map.get(r.roomId) ?? { tooCold: 0, perfect: 0, tooHot: 0 };
    if (r.vote === "too_cold") t.tooCold += r.n;
    else if (r.vote === "perfect") t.perfect += r.n;
    else t.tooHot += r.n;
    map.set(r.roomId, t);
  }
  return map;
}

export interface RoomRow extends Room {
  buildingName: string;
}

export async function listRooms(): Promise<RoomRow[]> {
  const rows = await db()
    .select({ room: rooms, buildingName: buildings.name })
    .from(rooms)
    .innerJoin(buildings, eq(buildings.id, rooms.buildingId))
    .orderBy(asc(buildings.name), asc(rooms.code));
  return rows.map((r) => ({ ...r.room, buildingName: r.buildingName }));
}

export interface RoomStatus {
  room: RoomRow;
  latest: LatestReading | null;
  fresh: boolean;
  tally: FeedbackTally;
  recommendation: Recommendation | null;
  prediction: Prediction | null;
}

/** Room overview for the dashboard and recommendations page. Cached per room for 30 s. */
export async function roomStatuses(opts: { withPrediction?: boolean } = {}): Promise<RoomStatus[]> {
  const [roomList, tallies] = await Promise.all([listRooms(), recentTallies()]);
  const empty: FeedbackTally = { tooCold: 0, perfect: 0, tooHot: 0 };

  const base = await Promise.all(
    roomList.map(async (room) => {
      const latest = await latestReading(room.id);
      const fresh = isFresh(latest);
      const tally = tallies.get(room.id) ?? empty;
      const recommendation = fresh
        ? recommend({ temperatureC: latest.temperatureC, humidityPct: latest.humidityPct, bands: env.bands, recent: tally })
        : null;
      return { room, latest, fresh, tally, recommendation, prediction: null as Prediction | null };
    }),
  );
  if (!opts.withPrediction) return base;

  // Use the cached prediction where there is one, ask ml for the rest in one call.
  const need: RoomStatus[] = [];
  for (const s of base) {
    if (!s.fresh) continue;
    const hit = await cached(() => redis().get(rkey.status(s.room.id)), null);
    if (hit) s.prediction = JSON.parse(hit) as Prediction;
    else need.push(s);
  }
  if (need.length) {
    const now = new Date();
    const preds = await predict(
      need.map((s) => ({ temperatureC: s.latest!.temperatureC, humidityPct: s.latest!.humidityPct, hour: hourIn(now) })),
    );
    if (preds) {
      need.forEach((s, i) => (s.prediction = preds[i] ?? null));
      await cached(async () => {
        const m = redis().multi();
        need.forEach((s) => s.prediction && m.set(rkey.status(s.room.id), JSON.stringify(s.prediction), "EX", STATUS_TTL_SEC));
        return m.exec();
      }, null);
    }
  }
  return base;
}

export async function findRoomByCode(code: string) {
  const [room] = await db().select().from(rooms).where(eq(rooms.code, code.toUpperCase())).limit(1);
  return room ?? null;
}

export async function sensorByKeyHash(keyHash: string) {
  const [s] = await db().select().from(sensors).where(and(eq(sensors.keyHash, keyHash), eq(sensors.active, true))).limit(1);
  return s ?? null;
}
