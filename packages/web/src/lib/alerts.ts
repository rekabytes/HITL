import { and, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import { alerts, feedback, pics, rooms, sensors } from "@hitl/db";
import type { AlertKind, AlertSeverity } from "@hitl/shared";
import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { publish } from "./redis";

/** After an automatic alert is resolved, wait this long before raising the same one again. */
const COOLDOWN_MIN = 60;
const FEEDBACK_WINDOW_MIN = 30;
const OFFLINE_AFTER_MIN = 30;

/**
 * Opens an automatic alert unless one for this room and kind is already open
 * (a partial unique index enforces that) or one was resolved within the cooldown.
 */
export async function raiseAutoAlert(roomId: string, kind: Exclude<AlertKind, "manual">, severity: AlertSeverity, message: string) {
  const since = new Date(Date.now() - COOLDOWN_MIN * 60_000);
  const [recent] = await db()
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(eq(alerts.roomId, roomId), eq(alerts.kind, kind), eq(alerts.status, "resolved"), gt(alerts.resolvedAt, since)))
    .limit(1);
  if (recent) return;

  const [created] = await db()
    .insert(alerts)
    .values({ roomId, kind, severity, message })
    .onConflictDoNothing()
    .returning({ id: alerts.id });
  if (!created) return;

  await publish({ type: "alert", roomId, kind, severity, message });
  void notifyPic(roomId, message);
}

async function notifyPic(roomId: string, message: string) {
  const [row] = await db()
    .select({ email: pics.email, room: rooms.name, code: rooms.code })
    .from(pics)
    .innerJoin(rooms, eq(rooms.id, pics.roomId))
    .where(eq(pics.roomId, roomId))
    .limit(1);
  if (!row?.email) return;
  await sendMail(
    row.email,
    `[HITL] Alert in ${row.code}`,
    `${message}\n\nRoom: ${row.room} (${row.code})\nOpen the alerts page: ${env.appUrl}/fm/alerts\n`,
  );
}

export async function checkReadingAlerts(roomId: string, temperatureC: number, humidityPct: number) {
  const b = env.bands;
  if (temperatureC >= b.tempMaxC + 2) {
    await raiseAutoAlert(roomId, "temperature", temperatureC >= b.tempMaxC + 4 ? "critical" : "warning",
      `Temperature is ${temperatureC.toFixed(1)} °C, above the ${b.tempMaxC} °C comfort limit.`);
  } else if (temperatureC <= b.tempMinC - 2) {
    await raiseAutoAlert(roomId, "temperature", "warning",
      `Temperature is ${temperatureC.toFixed(1)} °C, below the ${b.tempMinC} °C comfort limit.`);
  }
  if (humidityPct >= b.humidityMaxPct + 10) {
    await raiseAutoAlert(roomId, "humidity", "warning",
      `Humidity is ${humidityPct.toFixed(0)}%, above the ${b.humidityMaxPct}% comfort limit.`);
  }
}

/** Raises a feedback alert when most recent votes in a room say too hot or too cold. */
export async function checkFeedbackAlerts(roomId: string) {
  const since = new Date(Date.now() - FEEDBACK_WINDOW_MIN * 60_000);
  const rows = await db()
    .select({ vote: feedback.vote, n: sql<number>`count(*)::int` })
    .from(feedback)
    .where(and(eq(feedback.roomId, roomId), gt(feedback.createdAt, since)))
    .groupBy(feedback.vote);
  const count = (v: string) => rows.find((r) => r.vote === v)?.n ?? 0;
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (total < 3) return;
  for (const [vote, word] of [["too_hot", "too hot"], ["too_cold", "too cold"]] as const) {
    const n = count(vote);
    if (n / total >= 0.6) {
      await raiseAutoAlert(roomId, "feedback", n >= 5 ? "critical" : "warning",
        `${n} of ${total} occupants said the room is ${word} in the last ${FEEDBACK_WINDOW_MIN} minutes.`);
    }
  }
}

/** Raises an alert for each assigned, active sensor that has gone quiet. Cheap enough to run on page load. */
export async function checkOfflineSensors() {
  const cutoff = new Date(Date.now() - OFFLINE_AFTER_MIN * 60_000);
  const quiet = await db()
    .select({ roomId: sensors.roomId, deviceId: sensors.deviceId, lastSeenAt: sensors.lastSeenAt })
    .from(sensors)
    .where(and(eq(sensors.active, true), isNotNull(sensors.roomId), isNotNull(sensors.lastSeenAt), lt(sensors.lastSeenAt, cutoff)));
  for (const s of quiet) {
    await raiseAutoAlert(s.roomId!, "sensor_offline", "warning",
      `Sensor ${s.deviceId} has sent nothing for over ${OFFLINE_AFTER_MIN} minutes.`);
  }
}
