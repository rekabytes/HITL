import { redirect } from "next/navigation";
import { logoutAction } from "./actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sends each role to its home. Occupants use the mobile app, so they get a short note. */
export default async function Home() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");
  if (user.role === "facility_manager") redirect("/fm");

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Hi {user.name}</h1>
        <p className="sub">
          Occupant accounts give feedback from the mobile app. This portal is for admins and facility managers.
        </p>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-primary btn-block">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
