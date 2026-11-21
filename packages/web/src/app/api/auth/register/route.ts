import { users } from "@hitl/db";
import { registerInput } from "@hitl/shared";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, problem, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Mobile self sign-up. Always creates an occupant; staff accounts come from /admin/users. */
export async function POST(req: Request) {
  if (!(await rateLimit(`register:${clientIp(req.headers)}`, 5, 3600))) {
    return problem(429, "Too many sign-ups from this network. Try again later.");
  }
  const body = await readJson(req, registerInput);
  if (!body.ok) return body.response;

  const [user] = await db()
    .insert(users)
    .values({
      name: body.data.name,
      email: body.data.email,
      passwordHash: await hashPassword(body.data.password),
      role: "occupant",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!user) return problem(409, "That email already has an account.");

  const { token, expiresAt } = await createSession(user.id, "mobile");
  return json(
    { token, expiresAt: expiresAt.toISOString(), user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    201,
  );
}
