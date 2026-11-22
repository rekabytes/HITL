import { and, eq, inArray } from "drizzle-orm";
import { co2Readings, rooms, sensorReadings, sensorRooms, sensors } from "@hitl/db";
import { db } from "./db";

import { co2Status, deviceStatus, type Co2Status } from "@hitl/shared";

export type PublicSensorStatus = {
  deviceId: string;
  label: string | null;
  firmwareVersion: string | null;
  active: boolean;
  esp32: {
    status: "online" | "offline" | "inactive" | "never_reported";
    lastHeartbeatAt: string | null;
    lastSeenAt: string | null;
  };
  sensor: {
    status: "online" | "offline" | "unknown" | "inactive";
    lastReadingAt: string | null;
    temperatureC: number | null;
    humidityPct: number | null;
    pressureHpa: number | null;
  };
  co2: { status: Co2Status; lastReadingAt: string | null; ppm: number | null };
  rooms: string[];
};

type SensorRow = typeof sensors.$inferSelect;

type LatestRow = {
  sensorId: string | null;
  temperatureC: number;
  humidityPct: number;
  pressureHpa: number | null;
  recordedAt: Date;
};

export async function publicSensorStatuses(deviceId?: string): Promise<PublicSensorStatus[]> {
  const sensorRows = await db()
    .select()
    .from(sensors)
    .where(deviceId ? eq(sensors.deviceId, deviceId) : undefined)
    .orderBy(sensors.deviceId);

  if (sensorRows.length === 0) return [];

  const ids = sensorRows.map((sensor) => sensor.id);
  const roomRows = await db()
    .select({ sensorId: sensorRooms.sensorId, code: rooms.code })
    .from(sensorRooms)
    .innerJoin(rooms, eq(rooms.id, sensorRooms.roomId))
    .where(inArray(sensorRooms.sensorId, ids));
  const roomsBySensor = new Map<string, string[]>();
  for (const row of roomRows) {
    const list = roomsBySensor.get(row.sensorId) ?? [];
    list.push(row.code);
    roomsBySensor.set(row.sensorId, list);
  }

  const latestRows = await db()
    .selectDistinctOn([sensorReadings.sensorId], {
      sensorId: sensorReadings.sensorId,
      temperatureC: sensorReadings.temperatureC,
      humidityPct: sensorReadings.humidityPct,
      pressureHpa: sensorReadings.pressureHpa,
      recordedAt: sensorReadings.recordedAt,
    })
    .from(sensorReadings)
    .innerJoin(sensors, and(eq(sensors.id, sensorReadings.sensorId), eq(sensors.lastRealReadingAt, sensorReadings.recordedAt)))
    .where(inArray(sensorReadings.sensorId, ids))
    .orderBy(sensorReadings.sensorId);
  const latestBySensor = new Map<string, LatestRow>();
  for (const row of latestRows) {
    if (row.sensorId) latestBySensor.set(row.sensorId, row);
  }

  const latestCo2 = await db()
    .selectDistinctOn([co2Readings.sensorId], { sensorId: co2Readings.sensorId, ppm: co2Readings.co2Ppm })
    .from(co2Readings)
    .innerJoin(sensors, and(eq(sensors.id, co2Readings.sensorId), eq(sensors.lastCo2ReadingAt, co2Readings.recordedAt)))
    .where(inArray(co2Readings.sensorId, ids))
    .orderBy(co2Readings.sensorId);
  const co2BySensor = new Map(latestCo2.map((row) => [row.sensorId, row.ppm]));
  const now = Date.now();

  return sensorRows.map((sensor: SensorRow) => {
    const latest = latestBySensor.get(sensor.id);
    const status = deviceStatus(sensor, now);
    return {
      deviceId: sensor.deviceId,
      label: sensor.label,
      firmwareVersion: sensor.firmwareVersion,
      active: sensor.active,
      esp32: {
        status: status.esp32,
        lastHeartbeatAt: sensor.lastHeartbeatAt?.toISOString() ?? null,
        lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
      },
      sensor: {
        status: status.sensor,
        lastReadingAt: latest?.recordedAt.toISOString() ?? null,
        temperatureC: latest?.temperatureC ?? null,
        humidityPct: latest?.humidityPct ?? null,
        pressureHpa: latest?.pressureHpa ?? null,
      },
      co2: {
        status: co2Status(sensor, now),
        lastReadingAt: sensor.lastCo2ReadingAt?.toISOString() ?? null,
        ppm: co2BySensor.get(sensor.id) ?? null,
      },
      rooms: (roomsBySensor.get(sensor.id) ?? []).sort(),
    };
  });
}
