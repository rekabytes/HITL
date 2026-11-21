"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { users } from "@hitl/db";
import { loginInput, registerInput, STAFF_ROLES } from "@hitl/shared";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { checkCredentials, LOGIN_MESSAGES } from "@/lib/login";
import { clientIp } from "@/lib/rate-limit";

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginInput.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };

  const result = await checkCredentials(parsed.data.email, parsed.data.password, clientIp(await headers()));
  if (!result.ok) return { error: LOGIN_MESSAGES[result.reason] };
  if (!STAFF_ROLES.includes(result.user.role)) {
    return { error: "Occupant accounts sign in from the mobile app." };
  }

  const { token, expiresAt } = await createSession(result.user.id, "web");
  await setSessionCookie(token, expiresAt);
  redirect(result.user.mustChangePassword ? "/change-password" : "/");
}

export async function adminExists(): Promise<boolean> {
  const [row] = await db().select({ n: count() }).from(users).where(eq(users.role, "admin"));
  return (row?.n ?? 0) > 0;
}

/** First-run only: creates the first admin. Refuses once any admin exists. */
export async function setupAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (await adminExists()) return { error: "An admin already exists. Sign in instead." };
  const parsed = registerInput.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (form.get("password") !== form.get("confirm")) return { error: "Passwords do not match." };

  const [user] = await db()
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!user) return { error: "That email is already used." };

  const { token, expiresAt } = await createSession(user.id, "web");
  await setSessionCookie(token, expiresAt);
  redirect("/admin");
}
