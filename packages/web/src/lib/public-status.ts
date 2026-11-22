import { desc, eq, inArray } from "drizzle-orm";
import { rooms, sensorReadings, sensorRooms, sensors } from "@hitl/db";
import { db } from "./db";

export const ESP32_ONLINE_MIN = 10;
export const SENSOR_FRESH_MIN = 30;

export type PublicSensorStatus = {
  deviceId: string;
  label: string | null;
  firmwareVersion: string | null;
  active: boolean;
  esp32: {
    status: "online" | "offline" | "inactive" | "never_reported";
    lastSeenAt: string | null;
  };
  sensor: {
    status: "healthy" | "stale" | "inactive" | "never_reported";
    lastReadingAt: string | null;
    temperatureC: number | null;
    humidityPct: number | null;
    pressureHpa: number | null;
  };
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

function freshness(date: Date | null, minutes: number): boolean {
  return !!date && date.getTime() > Date.now() - minutes * 60_000;
}

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
    .innerJoin(rooms, eq(rooms.id, sensorRooms.roomId));
  const roomsBySensor = new Map<string, string[]>();
  for (const row of roomRows) {
    if (!ids.includes(row.sensorId)) continue;
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
    .where(inArray(sensorReadings.sensorId, ids))
    .orderBy(sensorReadings.sensorId, desc(sensorReadings.recordedAt));
  const latestBySensor = new Map<string, LatestRow>();
  for (const row of latestRows) {
    if (row.sensorId) latestBySensor.set(row.sensorId, row);
  }

  return sensorRows.map((sensor: SensorRow) => {
    const latest = latestBySensor.get(sensor.id);
    const espOnline = freshness(sensor.lastSeenAt, ESP32_ONLINE_MIN);
    const sensorFresh = freshness(latest?.recordedAt ?? null, SENSOR_FRESH_MIN);
    return {
      deviceId: sensor.deviceId,
      label: sensor.label,
      firmwareVersion: sensor.firmwareVersion,
      active: sensor.active,
      esp32: {
        status: !sensor.active ? "inactive" : !sensor.lastSeenAt ? "never_reported" : espOnline ? "online" : "offline",
        lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
      },
      sensor: {
        status: !sensor.active ? "inactive" : !latest ? "never_reported" : sensorFresh ? "healthy" : "stale",
        lastReadingAt: latest?.recordedAt.toISOString() ?? null,
        temperatureC: latest?.temperatureC ?? null,
        humidityPct: latest?.humidityPct ?? null,
        pressureHpa: latest?.pressureHpa ?? null,
      },
      rooms: (roomsBySensor.get(sensor.id) ?? []).sort(),
    };
  });
}
