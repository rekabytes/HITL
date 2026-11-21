"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildings, rooms, sensors } from "@hitl/db";
import { roomCodeSchema } from "@hitl/shared";
import { requireAdmin, secretHash } from "@/lib/auth";
import { db } from "@/lib/db";
import { dbError, optStr, str, type FormState } from "@/lib/form";

function newDeviceKey() {
  return `hitl_${randomBytes(24).toString("base64url")}`;
}

export async function createBuildingAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(form, "name");
  if (!name) return { error: "Name is required." };
  try {
    await db().insert(buildings).values({ name, address: optStr(form, "address") });
  } catch (err) {
    return dbError(err, "A building with that name exists.");
  }
  revalidatePath("/admin/rooms");
  return { ok: `Added ${name}.` };
}

const roomForm = z.object({
  buildingId: z.uuid("Pick a building"),
  name: z.string().trim().min(1, "Name is required").max(120),
  code: roomCodeSchema,
  floor: z.string().trim().max(40).nullable(),
});

export async function createRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = roomForm.safeParse({
    buildingId: str(form, "buildingId"),
    name: str(form, "name"),
    code: str(form, "code"),
    floor: optStr(form, "floor"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await db().insert(rooms).values(parsed.data);
  } catch (err) {
    return dbError(err, "That room code or name is already used.");
  }
  revalidatePath("/admin/rooms");
  return { ok: `Added room ${parsed.data.code}.` };
}

export async function updateRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!id || !name) return { error: "Name is required." };
  try {
    await db().update(rooms).set({ name, floor: optStr(form, "floor") }).where(eq(rooms.id, id));
  } catch (err) {
    return dbError(err, "Another room in this building has that name.");
  }
  revalidatePath("/admin/rooms");
  return { ok: "Saved." };
}

export async function createSensorAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const deviceId = str(form, "deviceId");
  if (!/^[A-Za-z0-9_.:-]{2,64}$/.test(deviceId)) return { error: "Device id: 2 to 64 letters, numbers, - _ . or :" };
  const key = newDeviceKey();
  try {
    await db().insert(sensors).values({
      deviceId,
      label: optStr(form, "label"),
      roomId: optStr(form, "roomId"),
      keyHash: secretHash(key),
    });
  } catch (err) {
    return dbError(err, "That device id is already registered.");
  }
  revalidatePath("/admin/rooms");
  return { ok: `Registered ${deviceId}. Put this key in the firmware as the X-Device-Key header.`, secret: key };
}

export async function updateSensorAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  await db()
    .update(sensors)
    .set({ roomId: optStr(form, "roomId"), active: form.get("active") === "on" })
    .where(eq(sensors.id, id));
  revalidatePath("/admin/rooms");
  return { ok: "Saved." };
}

export async function rotateSensorKeyAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  const key = newDeviceKey();
  await db().update(sensors).set({ keyHash: secretHash(key) }).where(eq(sensors.id, id));
  return { ok: "New key made. The old key stops working now.", secret: key };
}
