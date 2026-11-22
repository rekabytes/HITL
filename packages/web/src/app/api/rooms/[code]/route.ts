import { apiUser } from "@/lib/auth";
import { json, problem } from "@/lib/http";
import { roomSummary } from "@/lib/occupant";

export const dynamic = "force-dynamic";

/** Any signed-in user: room details and current conditions, used after a QR scan. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  if (!(await apiUser(req))) return problem(401, "Sign in first");
  const { code } = await ctx.params;
  const room = await roomSummary(decodeURIComponent(code));
  if (!room) return problem(404, "Room not found");
  return json(room);
}
