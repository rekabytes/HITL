import { apiUser } from "@/lib/auth";
import { json, problem } from "@/lib/http";
import { runTraining } from "@/lib/training";

export const dynamic = "force-dynamic";

/** Admin only. Retrains the comfort model on every labelled vote. */
export async function POST(req: Request) {
  const user = await apiUser(req);
  if (user?.role !== "admin") return problem(403, "Admin only");
  const result = await runTraining();
  return json(result, result.status === "failed" ? 502 : result.status === "busy" ? 409 : 200);
}
