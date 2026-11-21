"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@hitl/db";
import { passwordSchema, ROLES } from "@hitl/shared";
import { destroyUserSessions, hashPassword, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { dbError, str, type FormState } from "@/lib/form";

const createUser = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  role: z.enum(ROLES),
  password: passwordSchema,
});

export async function createUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = createUser.safeParse({
    name: str(form, "name"),
    email: str(form, "email"),
    role: str(form, "role"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  try {
    await db().insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
    });
  } catch (err) {
    return dbError(err, "That email already has an account.");
  }
  revalidatePath("/admin/users");
  return { ok: `Created ${parsed.data.email}. They will pick their own password at first sign-in.` };
}

export async function updateUserAction(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const id = str(form, "id");
  const role = z.enum(ROLES).safeParse(str(form, "role"));
  const active = form.get("active") === "on";
  if (!id || !role.success) return { error: "Bad request." };
  if (id === me.id && (role.data !== "admin" || !active)) {
    return { error: "You cannot remove your own admin access." };
  }
  await db().update(users).set({ role: role.data, active }).where(eq(users.id, id));
  await destroyUserSessions(id);
  revalidatePath("/admin/users");
  return { ok: "Saved." };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(form, "id");
  const password = passwordSchema.safeParse(form.get("password"));
  if (!id) return { error: "Bad request." };
  if (!password.success) return { error: password.error.issues[0]?.message };
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password.data), mustChangePassword: true })
    .where(eq(users.id, id));
  await destroyUserSessions(id);
  revalidatePath("/admin/users");
  return { ok: "Temporary password set. Share it with the user directly." };
}
