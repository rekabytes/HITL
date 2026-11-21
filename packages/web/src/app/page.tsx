import { redirect } from "next/navigation";
import { logoutAction } from "./actions";
import { AuthCard } from "@/components/AuthCard";
import { Icon } from "@/components/Icon";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sends each role to its home. Occupants use the mobile app, so they get a short note. */
export default async function Home() {
  const user = await requireUser();
  if (user.role === "admin" || user.role === "facility_manager") redirect("/fm");

  return (
    <AuthCard
      title={`Hi ${user.name}`}
      sub="Occupant accounts give feedback from the mobile app. This portal is for admins and facility managers."
    >
      <form action={logoutAction}>
        <button type="submit" className="btn btn-primary btn-block">
          <Icon name="log-out" size={15} />
          Sign out
        </button>
      </form>
    </AuthCard>
  );
}
