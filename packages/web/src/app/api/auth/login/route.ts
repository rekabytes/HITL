import { loginInput } from "@hitl/shared";
import { createSession } from "@/lib/auth";
import { json, problem, readJson } from "@/lib/http";
import { checkCredentials, LOGIN_MESSAGES } from "@/lib/login";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Mobile sign-in. Returns a bearer token for `Authorization: Bearer <token>`. */
export async function POST(req: Request) {
  const body = await readJson(req, loginInput);
  if (!body.ok) return body.response;

  const result = await checkCredentials(body.data.email, body.data.password, clientIp(req.headers));
  if (!result.ok) return problem(result.reason === "rate_limited" ? 429 : 401, LOGIN_MESSAGES[result.reason]);

  const { user } = result;
  const { token, expiresAt } = await createSession(user.id, "mobile");
  return json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
  });
}
