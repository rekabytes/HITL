import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@hitl/db";
import { passwordSchema } from "@hitl/shared";
import { apiUser, destroyUserSessions, hashPassword, secretHash, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, problem, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const body = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

/** Mobile password change. Also clears the "must change password" flag set by an admin reset. */
export async function POST(req: Request) {
  const user = await apiUser(req);
  if (!user) return problem(401, "Sign in first");
  const parsed = await readJson(req, body);
  if (!parsed.ok) return parsed.response;

  const [row] = await db().select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return problem(401, "Current password is wrong");
  }
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false })
    .where(eq(users.id, user.id));

  const auth = req.headers.get("authorization");
  const keep = auth?.startsWith("Bearer ") ? secretHash(auth.slice(7).trim()) : undefined;
  await destroyUserSessions(user.id, keep);
  return json({ status: "changed" });
}
