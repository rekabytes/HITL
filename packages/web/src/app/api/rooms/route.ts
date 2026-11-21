import { apiUser } from "@/lib/auth";
import { json, problem } from "@/lib/http";
import { listRooms } from "@/lib/readings";

export const dynamic = "force-dynamic";

/** Any signed-in user: the room list for the mobile app's picker. */
export async function GET(req: Request) {
  if (!(await apiUser(req))) return problem(401, "Sign in first");
  const rows = await listRooms();
  return json({
    items: rows.map((r) => ({ code: r.code, name: r.name, building: r.buildingName, floor: r.floor })),
  });
}
