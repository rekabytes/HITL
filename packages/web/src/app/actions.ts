"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function logoutAction() {
  const token = await sessionToken();
  if (token) await destroySession(token);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
