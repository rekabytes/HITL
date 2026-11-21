"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildings, rooms, sensorRooms, sensors } from "@hitl/db";
import { roomCodeSchema } from "@hitl/shared";
import { requireAdmin, secretHash } from "@/lib/auth";
import { db } from "@/lib/db";
import { dbError, optStr, str, type FormState } from "@/lib/form";
import { cached, redis, rkey } from "@/lib/redis";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function roomIdsFrom(form: FormData): string[] {
  return [...new Set(form.getAll("roomIds").map(String).filter((v) => UUID.test(v)))];
}

async function setSensorRooms(sensorId: string, roomIds: string[]) {
  await db().transaction(async (tx) => {
    await tx.delete(sensorRooms).where(eq(sensorRooms.sensorId, sensorId));
    if (roomIds.length) await tx.insert(sensorRooms).values(roomIds.map((roomId) => ({ sensorId, roomId })));
  });
}

export async function createSensorAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const deviceId = str(form, "deviceId");
  if (!/^[A-Za-z0-9_.:-]{2,64}$/.test(deviceId)) return { error: "Device id: 2 to 64 letters, numbers, - _ . or :" };
  const firmwareVersion = optStr(form, "firmwareVersion");
  if (firmwareVersion && firmwareVersion.length > 64) return { error: "Firmware version is too long." };
  const key = newDeviceKey();
  let sensorId: string;
  try {
    const [row] = await db()
      .insert(sensors)
      .values({ deviceId, label: optStr(form, "label"), firmwareVersion, keyHash: secretHash(key) })
      .returning({ id: sensors.id });
    sensorId = row!.id;
  } catch (err) {
    return dbError(err, "That device id is already registered.");
  }
  await setSensorRooms(sensorId, roomIdsFrom(form));
  revalidatePath("/admin/rooms");
  return { ok: `Registered ${deviceId}. Put this key in the firmware as the X-Device-Key header.`, secret: key };
}

export async function updateSensorAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Bad request." };
  const firmwareVersion = optStr(form, "firmwareVersion");
  if (firmwareVersion && firmwareVersion.length > 64) return { error: "Firmware version is too long." };
  await db()
    .update(sensors)
    .set({ active: form.get("active") === "on", firmwareVersion, label: optStr(form, "label") })
    .where(eq(sensors.id, id));
  await setSensorRooms(id, roomIdsFrom(form));
  revalidatePath("/admin/rooms");
  return { ok: "Saved." };
}

/** Removes the sensor and its room links. Its past readings stay, without the sensor link. */
export async function deleteSensorAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Bad request." };
  const [gone] = await db().delete(sensors).where(eq(sensors.id, id)).returning({ deviceId: sensors.deviceId });
  revalidatePath("/admin/rooms");
  return gone ? { ok: `Deleted ${gone.deviceId}.` } : { error: "Already deleted." };
}

/**
 * Deletes a room and everything recorded for it: readings, votes, alerts,
 * actions and its person in charge. The admin has to type the room code.
 */
export async function deleteRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Bad request." };
  const [room] = await db().select().from(rooms).where(eq(rooms.id, id)).limit(1);
  if (!room) return { error: "Already deleted." };
  if (str(form, "confirm").toUpperCase() !== room.code) return { error: `Type ${room.code} to confirm.` };
  await db().delete(rooms).where(eq(rooms.id, id));
  await cached(() => redis().del(rkey.latest(id), rkey.status(id)), 0);
  revalidatePath("/admin/rooms");
  revalidatePath("/admin/pics");
  return { ok: `Deleted ${room.code} and its history.` };
}

/** Only empty buildings can go; rooms must be deleted first. */
export async function deleteBuildingAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!UUID.test(id)) return { error: "Bad request." };
  try {
    await db().delete(buildings).where(eq(buildings.id, id));
  } catch (err) {
    return dbError(err, "", "Delete this building's rooms first.");
  }
  revalidatePath("/admin/rooms");
  return { ok: "Deleted." };
}

export async function rotateSensorKeyAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  const key = newDeviceKey();
  await db().update(sensors).set({ keyHash: secretHash(key) }).where(eq(sensors.id, id));
  return { ok: "New key made. The old key stops working now.", secret: key };
}
