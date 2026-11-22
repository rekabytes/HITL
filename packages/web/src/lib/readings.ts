import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { buildings, co2Readings, feedback, rooms, sensorReadings, sensorRooms, sensors, type Room, type Sensor } from "@hitl/db";
import {
  co2Advice,
  ESP32_ONLINE_MIN,
  recommend,
  type sensorReportInput,
  type FeedbackTally,
  type Recommendation,
} from "@hitl/shared";
import { checkCo2Alerts, checkReadingAlerts, escalateStaleAlerts } from "./alerts";
import { db } from "./db";
import { env } from "./env";
import { predict, type Prediction } from "./ml";
import { cached, publish, redis, rkey } from "./redis";
import type { z } from "zod";
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

export interface LatestCo2 {
  roomId: string;
  co2Ppm: number;
  /** Time of the oldest CO2 reading contributing to the average; used for freshness. */
  recordedAt: string;
  sensorCount: number;
}

/** Room CO2 averages use only recently reporting, currently online sensors. */
export async function latestCo2(roomId: string): Promise<LatestCo2 | null> {
  const cutoff = new Date(Date.now() - ESP32_ONLINE_MIN * 60_000);
  const rows = await db()
    .selectDistinctOn([co2Readings.sensorId], { co2Ppm: co2Readings.co2Ppm, recordedAt: co2Readings.recordedAt })
    .from(co2Readings)
    .innerJoin(sensors, and(eq(sensors.id, co2Readings.sensorId), eq(sensors.lastCo2ReadingAt, co2Readings.recordedAt)))
    .innerJoin(sensorRooms, and(eq(sensorRooms.sensorId, sensors.id), eq(sensorRooms.roomId, co2Readings.roomId)))
    .where(and(eq(co2Readings.roomId, roomId), eq(sensors.active, true), eq(sensors.co2State, "online"), gt(co2Readings.recordedAt, cutoff)))
    .orderBy(co2Readings.sensorId);
  if (rows.length === 0) return null;
  return {
    roomId,
    co2Ppm: Math.round(rows.reduce((sum, r) => sum + r.co2Ppm, 0) / rows.length),
    // Expire the aggregate when its oldest contributing sample expires.
    recordedAt: new Date(Math.min(...rows.map((r) => r.recordedAt.getTime()))).toISOString(),
    sensorCount: rows.length,
  };
}

export function isCo2Fresh(c: LatestCo2 | null): c is LatestCo2 {
  return !!c && Date.now() - new Date(c.recordedAt).getTime() < ESP32_ONLINE_MIN * 60_000;
}

/** Persist both sensor states and any measurements in one transaction. */
export async function ingestSensorReport(sensor: Sensor, report: z.infer<typeof sensorReportInput>) {
  const recordedAt = new Date();
  const checked = "sensorStatus" in report ? report : null;
  const co2 = checked?.co2;
  const reading = "sensorStatus" in report ? (report.sensorStatus === "online" ? report.reading : null) : report;
  const roomIds = await db().transaction(async (tx) => {
    // Serialize reports from this device before assigning the shared timestamp.
    const [current] = await tx.select({ co2State: sensors.co2State }).from(sensors).where(eq(sensors.id, sensor.id)).for("update");
    const roomIds = (await tx.select({ roomId: sensorRooms.roomId }).from(sensorRooms).where(eq(sensorRooms.sensorId, sensor.id)))
      .map((row) => row.roomId);
    const destinations = roomIds.length ? roomIds : [null];
    recordedAt.setTime(Date.now());
    await tx.update(sensors).set({
      lastSeenAt: recordedAt,
      co2State: co2?.status ?? null,
      ...(checked && {
        lastHeartbeatAt: recordedAt,
        sensorResponding: !!reading,
        firmwareVersion: checked.firmwareVersion,
        ...(reading && { lastRealReadingAt: recordedAt }),
      }),
      ...(co2?.status === "online" && { lastCo2ReadingAt: recordedAt }),
    }).where(eq(sensors.id, sensor.id));
    if (reading) {
      await tx.insert(sensorReadings).values(destinations.map((roomId) => ({
        sensorId: sensor.id, roomId, recordedAt, temperatureC: reading.temperature,
        humidityPct: reading.humidity, pressureHpa: reading.pressure ?? null,
      })));
    }
    if (co2?.status === "online") {
      await tx.insert(co2Readings).values(destinations.map((roomId) => ({
        sensorId: sensor.id, roomId, recordedAt, co2Ppm: co2.ppm,
      })));
    }
    return { ids: roomIds, co2Changed: Boolean(co2 || current?.co2State) };
  });

  // Measurements are already committed. A derived update failure must not make
  // the device retry the same write and store duplicate measurements.
  try {
    for (const roomId of roomIds.ids) {
      if (roomIds.co2Changed) {
        const latest = await latestCo2(roomId);
        await publish({ type: "co2", roomId, reading: latest });
        if (latest && co2?.status === "online") await checkCo2Alerts(roomId, latest.co2Ppm);
      }
      if (reading) {
        const latest = await computeLatest(roomId);
        if (!latest) continue;
        await cached(
          () => redis().multi().set(rkey.latest(roomId), JSON.stringify(latest), "EX", LATEST_TTL_SEC).del(rkey.status(roomId)).exec(),
          null,
        );
        await publish({ type: "reading", ...latest });
        await checkReadingAlerts(roomId, latest.temperatureC, latest.humidityPct);
      }
    }
    if (reading || co2?.status === "online") await escalateStaleAlerts();
  } catch (err) {
    console.warn("[sensor] Report stored, but derived updates failed:", err instanceof Error ? err.name : "unknown error");
  }
  return { roomIds: roomIds.ids };
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
  /** Latest CO2, or null when the room has no CO2 sensor yet. Check `co2Fresh` before advising on it. */
  co2: LatestCo2 | null;
  co2Fresh: boolean;
  tally: FeedbackTally;
  recommendation: Recommendation | null;
  prediction: Prediction | null;
}

/**
 * Adds CO2 advice to the temperature and humidity advice. Works when only one
 * of the two sensors is reporting: either part can be missing.
 */
function withCo2(rec: Recommendation | null, co2Ppm: number | null): Recommendation | null {
  if (co2Ppm === null) return rec;
  const adv = co2Advice(co2Ppm, env.bands);
  if (!adv) return rec ?? { level: "ok", items: [`CO₂ is ${co2Ppm} ppm, below the ventilation advisory threshold.`] };
  if (!rec || rec.level === "ok") return { level: adv.level, items: [adv.item] };
  const level = rec.level === "action" || adv.level === "action" ? "action" : "advice";
  // The more urgent problem goes first, because the dashboard card shows only the first item.
  return { level, items: adv.level === "action" && rec.level !== "action" ? [adv.item, ...rec.items] : [...rec.items, adv.item] };
}

/** Room overview for the dashboard and recommendations page. Cached per room for 30 s. */
export async function roomStatuses(opts: { withPrediction?: boolean } = {}): Promise<RoomStatus[]> {
  const [roomList, tallies] = await Promise.all([listRooms(), recentTallies()]);
  const empty: FeedbackTally = { tooCold: 0, perfect: 0, tooHot: 0 };

  const base = await Promise.all(
    roomList.map(async (room) => {
      const [latest, co2] = await Promise.all([latestReading(room.id), latestCo2(room.id)]);
      const fresh = isFresh(latest);
      const co2Fresh = isCo2Fresh(co2);
      const tally = tallies.get(room.id) ?? empty;
      const base = fresh
        ? recommend({ temperatureC: latest.temperatureC, humidityPct: latest.humidityPct, bands: env.bands, recent: tally })
        : null;
      const recommendation = withCo2(base, co2Fresh ? co2.co2Ppm : null);
      return { room, latest, fresh, co2, co2Fresh, tally, recommendation, prediction: null as Prediction | null };
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
