import { eq } from "drizzle-orm";
import { users } from "@hitl/db";
import { db } from "./db";
import { verifyPassword } from "./auth";
import { rateLimit } from "./rate-limit";

// A real bcrypt hash of a random string, so unknown emails take as long as wrong passwords.
const DUMMY_HASH = "$2b$12$DaunGAR0L3UyKotL4Qp1ReibxUe6FcQ6wwcuOWFc8kcSQTm4qwZae";

export type LoginFailure = "rate_limited" | "invalid" | "inactive";

export async function checkCredentials(email: string, password: string, ip: string) {
  if (!(await rateLimit(`login:${ip}:${email}`, 10, 900))) return { ok: false as const, reason: "rate_limited" as LoginFailure };

  const [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return { ok: false as const, reason: "invalid" as LoginFailure };
  if (!user.active) return { ok: false as const, reason: "inactive" as LoginFailure };
  return { ok: true as const, user };
}

export const LOGIN_MESSAGES: Record<LoginFailure, string> = {
  rate_limited: "Too many attempts. Wait 15 minutes and try again.",
  invalid: "Wrong email or password.",
  inactive: "This account is turned off. Ask an admin.",
};
