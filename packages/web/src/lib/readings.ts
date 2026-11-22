import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { buildings, feedback, rooms, sensorReadings, sensorRooms, sensors, type Room, type Sensor } from "@hitl/db";
import { recommend, type FeedbackTally, type Recommendation, type SensorReadingInput } from "@hitl/shared";
import { checkReadingAlerts, escalateStaleAlerts } from "./alerts";
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
  /** Time of the newest reading that went into the average. */
  recordedAt: string;
  /** How many sensors were averaged. A large room can have several. */
  sensorCount: number;
}

const LATEST_TTL_SEC = 15 * 60;
const STATUS_TTL_SEC = 30;
/** A reading older than this is too stale to pair with a vote or to advise on. */
export const FRESH_MIN = 30;
/** Sensors that reported within this window are averaged into the room's current reading. */
export const AVERAGE_WINDOW_MIN = 15;

export async function sensorRoomIds(sensorId: string): Promise<string[]> {
  const rows = await db().select({ roomId: sensorRooms.roomId }).from(sensorRooms).where(eq(sensorRooms.sensorId, sensorId));
  return rows.map((r) => r.roomId);
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * The room's current conditions: the latest reading from each sensor that
 * reported in the last AVERAGE_WINDOW_MIN minutes, averaged. With one sensor
 * this is just its latest reading. When every sensor is quiet, the single
 * newest reading is returned so pages can still show how stale it is.
 */
async function computeLatest(roomId: string): Promise<LatestReading | null> {
  const cutoff = new Date(Date.now() - AVERAGE_WINDOW_MIN * 60_000);
  const perSensor = await db()
    .selectDistinctOn([sensorReadings.sensorId], {
      temperatureC: sensorReadings.temperatureC,
      humidityPct: sensorReadings.humidityPct,
      pressureHpa: sensorReadings.pressureHpa,
      recordedAt: sensorReadings.recordedAt,
    })
    .from(sensorReadings)
    .where(and(eq(sensorReadings.roomId, roomId), gt(sensorReadings.recordedAt, cutoff)))
    .orderBy(sensorReadings.sensorId, desc(sensorReadings.recordedAt));

  let rows = perSensor;
  if (rows.length === 0) {
    rows = await db()
      .select({
        temperatureC: sensorReadings.temperatureC,
        humidityPct: sensorReadings.humidityPct,
        pressureHpa: sensorReadings.pressureHpa,
        recordedAt: sensorReadings.recordedAt,
      })
      .from(sensorReadings)
      .where(eq(sensorReadings.roomId, roomId))
      .orderBy(desc(sensorReadings.recordedAt))
      .limit(1);
    if (rows.length === 0) return null;
  }

  const avg = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
  const pressures = rows.map((r) => r.pressureHpa).filter((p): p is number => p !== null);
  return {
    roomId,
    temperatureC: round(avg((r) => r.temperatureC), 2),
    humidityPct: round(avg((r) => r.humidityPct), 1),
    pressureHpa: pressures.length ? round(pressures.reduce((a, b) => a + b, 0) / pressures.length, 1) : null,
    recordedAt: new Date(Math.max(...rows.map((r) => r.recordedAt.getTime()))).toISOString(),
    sensorCount: rows.length,
  };
}

/** Records contact even when the BME280 cannot provide a measurement. */
export async function recordSensorFailure(sensor: Sensor, firmwareVersion: string) {
  const now = new Date();
  await db().update(sensors).set({
    lastSeenAt: now, lastHeartbeatAt: now, sensorResponding: false, firmwareVersion,
  }).where(eq(sensors.id, sensor.id));
}

/** Stores a reading and its device status together, then updates caches and alerts. */
export async function ingestReading(sensor: Sensor, input: SensorReadingInput, firmwareVersion?: string) {
  const recordedAt = new Date();
  const roomIds = await sensorRoomIds(sensor.id);
  const base = {
    sensorId: sensor.id,
    temperatureC: input.temperature,
    humidityPct: input.humidity,
    pressureHpa: input.pressure ?? null,
    recordedAt,
  };
  await db().transaction(async (tx) => {
    await tx.update(sensors).set(firmwareVersion ? {
      lastSeenAt: recordedAt, lastHeartbeatAt: recordedAt, sensorResponding: true,
      lastRealReadingAt: recordedAt, firmwareVersion,
    } : { lastSeenAt: recordedAt }).where(eq(sensors.id, sensor.id));
    await tx.insert(sensorReadings)
      .values(roomIds.length ? roomIds.map((roomId) => ({ ...base, roomId })) : [{ ...base, roomId: null }]);
  });

  for (const roomId of roomIds) {
    // Recompute the room average with this reading in it; alerts and the live feed use the average.
    const latest = await computeLatest(roomId);
    if (!latest) continue;
    await cached(
      () => redis().multi().set(rkey.latest(roomId), JSON.stringify(latest), "EX", LATEST_TTL_SEC).del(rkey.status(roomId)).exec(),
      null,
    );
    await publish({ type: "reading", ...latest });
    await checkReadingAlerts(roomId, latest.temperatureC, latest.humidityPct);
  }
  await escalateStaleAlerts();
  return { roomIds };
}

export async function latestReading(roomId: string): Promise<LatestReading | null> {
  const hit = await cached(() => redis().get(rkey.latest(roomId)), null);
  if (hit) {
    const parsed = JSON.parse(hit) as LatestReading;
    // Entries cached before averaging existed have no sensorCount; recompute those.
    if (typeof parsed.sensorCount === "number") return parsed;
  }
  const latest = await computeLatest(roomId);
  if (latest) await cached(() => redis().set(rkey.latest(roomId), JSON.stringify(latest), "EX", LATEST_TTL_SEC), null);
  return latest;
}

/**
 * The room's conditions at a past moment, averaged the same way as the live
 * value: each sensor's latest reading in the AVERAGE_WINDOW_MIN minutes up to
 * `at`. Null when no sensor reported in that window. Used for votes that were
 * queued offline and arrive late.
 */
export async function readingAt(roomId: string, at: Date): Promise<{ temperatureC: number; humidityPct: number } | null> {
  const from = new Date(at.getTime() - AVERAGE_WINDOW_MIN * 60_000);
  const rows = await db()
    .selectDistinctOn([sensorReadings.sensorId], {
      temperatureC: sensorReadings.temperatureC,
      humidityPct: sensorReadings.humidityPct,
    })
    .from(sensorReadings)
    .where(and(eq(sensorReadings.roomId, roomId), gt(sensorReadings.recordedAt, from), lte(sensorReadings.recordedAt, at)))
    .orderBy(sensorReadings.sensorId, desc(sensorReadings.recordedAt));
  if (rows.length === 0) return null;
  const avg = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
  return { temperatureC: round(avg((r) => r.temperatureC), 2), humidityPct: round(avg((r) => r.humidityPct), 1) };
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
