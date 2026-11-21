"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pics } from "@hitl/db";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { optStr, str, type FormState } from "@/lib/form";

const picForm = z.object({
  roomId: z.uuid("Pick a room"),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email").nullable(),
  phone: z
    .string()
    .regex(/^\+?[0-9 -]{7,20}$/, "Phone looks wrong. Use +60123456789.")
    .nullable(),
});

export async function savePicAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = picForm.safeParse({
    roomId: str(form, "roomId"),
    name: str(form, "name"),
    email: optStr(form, "email"),
    phone: optStr(form, "phone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { roomId, ...rest } = parsed.data;
  await db().insert(pics).values(parsed.data).onConflictDoUpdate({ target: pics.roomId, set: rest });
  revalidatePath("/admin/pics");
  return { ok: "Saved." };
}

export async function removePicAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!id) return { error: "Bad request." };
  await db().delete(pics).where(eq(pics.id, id));
  revalidatePath("/admin/pics");
  return { ok: "Removed." };
}
