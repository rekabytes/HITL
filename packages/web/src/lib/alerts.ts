import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { alerts, feedback, pics, rooms, sensorRooms, sensors } from "@hitl/db";
import type { AlertKind, AlertSeverity } from "@hitl/shared";
import { db } from "./db";
import { env } from "./env";
import { sendMail, type MailResult } from "./mail";
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
  void notifyAlert(created.id).catch((err) => console.warn("[alerts] notify failed:", err));
}

/**
 * Emails the alert to its room's person in charge and records the attempt.
 * Used for new alerts, the Re-notify button and escalation.
 */
export async function notifyAlert(alertId: string, opts: { escalation?: boolean } = {}): Promise<MailResult> {
  const [row] = await db()
    .select({
      message: alerts.message,
      severity: alerts.severity,
      createdAt: alerts.createdAt,
      code: rooms.code,
      roomName: rooms.name,
      email: pics.email,
      picName: pics.name,
    })
    .from(alerts)
    .leftJoin(rooms, eq(rooms.id, alerts.roomId))
    .leftJoin(pics, eq(pics.roomId, alerts.roomId))
    .where(eq(alerts.id, alertId))
    .limit(1);
  if (!row) return { sent: false, reason: "Alert not found." };
  if (!row.email) return { sent: false, reason: `No person in charge with an email for ${row.code ?? "this room"}.` };

  const prefix = opts.escalation ? "ESCALATION" : "Alert";
  const result = await sendMail(
    row.email,
    `[HITL] ${prefix} in ${row.code}: ${row.severity}`,
    [
      `Hello ${row.picName},`,
      "",
      opts.escalation
        ? `This alert has been open for over ${env.escalateAfterMin} minutes without anyone acknowledging it.`
        : "A new alert was opened in a room you are in charge of.",
      "",
      `Room: ${row.roomName} (${row.code})`,
      `Severity: ${row.severity}`,
      `Message: ${row.message}`,
      "",
      `Open the alerts page: ${env.appUrl}/fm/alerts`,
    ].join("\n"),
  );
  if (result.sent) {
    await db()
      .update(alerts)
      .set({ notifyCount: sql`${alerts.notifyCount} + 1`, lastNotifiedAt: new Date() })
      .where(eq(alerts.id, alertId));
  }
  return result;
}

/**
 * Escalates alerts nobody acknowledged in time: raises them to critical and
 * emails the person in charge again. The update claims each alert once, so
 * two callers at the same moment never send the same escalation twice.
 * Runs on sensor ingest and when the alerts or dashboard pages load.
 */
export async function escalateStaleAlerts() {
  const cutoff = new Date(Date.now() - env.escalateAfterMin * 60_000);
  const claimed = await db()
    .update(alerts)
    .set({ escalatedAt: new Date(), severity: "critical" })
    .where(and(eq(alerts.status, "open"), isNull(alerts.escalatedAt), lt(alerts.createdAt, cutoff)))
    .returning({ id: alerts.id });
  // No live event here: the alert is already counted on the dashboard.
  for (const a of claimed) {
    void notifyAlert(a.id, { escalation: true }).catch((err) => console.warn("[alerts] escalation mail failed:", err));
  }
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

/** Raises an alert in each room covered by an active sensor that has gone quiet. Cheap enough to run on page load. */
export async function checkOfflineSensors() {
  const cutoff = new Date(Date.now() - OFFLINE_AFTER_MIN * 60_000);
  const quiet = await db()
    .select({ roomId: sensorRooms.roomId, deviceId: sensors.deviceId })
    .from(sensors)
    .innerJoin(sensorRooms, eq(sensorRooms.sensorId, sensors.id))
    .where(and(eq(sensors.active, true), isNotNull(sensors.lastSeenAt), lt(sensors.lastSeenAt, cutoff)));
  for (const s of quiet) {
    await raiseAutoAlert(s.roomId, "sensor_offline", "warning",
      `Sensor ${s.deviceId} has sent nothing for over ${OFFLINE_AFTER_MIN} minutes.`);
  }
}
