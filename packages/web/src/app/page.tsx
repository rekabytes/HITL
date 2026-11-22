import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sends each role to its home: staff to the portal, occupants to the occupant app. */
export default async function Home() {
  const user = await requireUser();
  redirect(user.role === "admin" || user.role === "facility_manager" ? "/fm" : "/app");
}
