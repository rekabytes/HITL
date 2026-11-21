import { destroySession } from "@/lib/auth";
import { json, problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Mobile sign-out: ends the bearer token's session. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return problem(401, "Missing bearer token");
  await destroySession(auth.slice(7).trim());
  return json({ status: "signed_out" });
}
