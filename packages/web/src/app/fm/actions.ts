"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { actions, aiInsights, alerts } from "@hitl/db";
import { ALERT_SEVERITIES } from "@hitl/shared";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { optStr, str, type FormState } from "@/lib/form";
import { notifyAlert } from "@/lib/alerts";
import { publish } from "@/lib/redis";

export async function logActionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireStaff();
  const roomId = optStr(form, "roomId");
  const alertId = optStr(form, "alertId");
  const note = str(form, "note");
  if (!note) return { error: "Write what was done." };
  if (note.length > 2000) return { error: "Keep it under 2000 characters." };
  await db().insert(actions).values({ roomId, alertId, userId: user.id, note });
  revalidatePath("/fm/recommendations");
  revalidatePath("/fm/alerts");
  return { ok: "Logged." };
}

const manualAlert = z.object({
  roomId: z.uuid("Pick a room"),
  severity: z.enum(ALERT_SEVERITIES),
  message: z.string().trim().min(3, "Describe the problem").max(1000),
});

export async function createAlertAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireStaff();
  const parsed = manualAlert.safeParse({
    roomId: str(form, "roomId"),
    severity: str(form, "severity"),
    message: str(form, "message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [created] = await db()
    .insert(alerts)
    .values({ ...parsed.data, kind: "manual", createdBy: user.id })
    .returning({ id: alerts.id });
  await publish({ type: "alert", roomId: parsed.data.roomId, kind: "manual", severity: parsed.data.severity, message: parsed.data.message });
  const mail = await notifyAlert(created!.id);
  revalidatePath("/fm/alerts");
  return mail.sent
    ? { ok: "Alert opened and the person in charge was emailed." }
    : { ok: `Alert opened. No email sent: ${mail.reason}` };
}

/** Sends the alert to the room's person in charge again. */
export async function renotifyAlertAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireStaff();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  const mail = await notifyAlert(id);
  revalidatePath("/fm/alerts");
  return mail.sent ? { ok: "Sent." } : { error: mail.reason };
}

export async function acknowledgeAlertAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireStaff();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  await db()
    .update(alerts)
    .set({ status: "acknowledged", acknowledgedAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.status, "open")));
  revalidatePath("/fm/alerts");
  return { ok: "Acknowledged." };
}

export async function resolveAlertAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = str(form, "id");
  const note = str(form, "note");
  if (!id) return { error: "Bad request." };
  if (!note) return { error: "Say what fixed it." };
  const [alert] = await db()
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: user.id, resolutionNote: note })
    .where(and(eq(alerts.id, id), ne(alerts.status, "resolved")))
    .returning({ roomId: alerts.roomId });
  if (alert) await db().insert(actions).values({ roomId: alert.roomId, alertId: id, userId: user.id, note });
  revalidatePath("/fm/alerts");
  return { ok: "Resolved." };
}

/**
 * Accepts or dismisses an AI suggestion. Accepting also writes it to the
 * actions log, so the history shows what staff chose to do.
 */
export async function decideSuggestionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireStaff();
  const id = str(form, "id");
  const decision = str(form, "decision");
  if (!id || (decision !== "accepted" && decision !== "dismissed")) return { error: "Bad request." };
  const [row] = await db()
    .update(aiInsights)
    .set({ status: decision, decidedBy: user.id, decidedAt: new Date() })
    .where(and(eq(aiInsights.id, id), eq(aiInsights.kind, "suggestion"), eq(aiInsights.status, "open")))
    .returning({ roomId: aiInsights.roomId, title: aiInsights.title });
  if (!row) return { error: "Someone already decided this one." };
  if (decision === "accepted") {
    await db().insert(actions).values({ roomId: row.roomId, userId: user.id, note: `Accepted AI suggestion: ${row.title}` });
  }
  revalidatePath("/fm/recommendations");
  revalidatePath("/fm");
  return { ok: decision === "accepted" ? "Accepted and logged." : "Dismissed." };
}
