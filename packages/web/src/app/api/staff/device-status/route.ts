import { apiUser, isStaff } from "@/lib/auth";
import { json, problem } from "@/lib/http";
import { publicSensorStatuses } from "@/lib/public-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isStaff(await apiUser(req))) return problem(403, "Staff access required");
  try {
    return json(await publicSensorStatuses());
  } catch {
    return problem(503, "Unable to load device status");
  }
}
