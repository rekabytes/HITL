"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { actions, alerts } from "@hitl/db";
import { ALERT_SEVERITIES } from "@hitl/shared";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { optStr, str, type FormState } from "@/lib/form";
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
  await db().insert(alerts).values({ ...parsed.data, kind: "manual", createdBy: user.id });
  await publish({ type: "alert", roomId: parsed.data.roomId, kind: "manual", severity: parsed.data.severity, message: parsed.data.message });
  revalidatePath("/fm/alerts");
  return { ok: "Alert opened." };
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
