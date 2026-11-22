import type { Metadata } from "next";
import Link from "next/link";
import { STAFF_ROLES } from "@hitl/shared";
import { Icon } from "@/components/Icon";
import { InstallApp } from "@/components/mobile/InstallApp";
import { SignOutButton } from "@/components/mobile/SignOutButton";
import { initials } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const staff = STAFF_ROLES.includes(user.role);

  return (
    <div className="m-stack">
      <section className="m-card m-profile">
        <span className="avatar avatar-lg">{initials(user.name)}</span>
        <div>
          <strong>{user.name}</strong>
          <div className="muted small">{user.email}</div>
        </div>
      </section>

      <section className="m-card">
        <h2>App</h2>
        <InstallApp />
      </section>

      <section className="m-card m-links">
        <Link href="/change-password">
          <Icon name="lock" size={16} /> Change password <Icon name="chevron-right" size={16} />
        </Link>
        {staff && (
          <Link href="/fm">
            <Icon name="layout" size={16} /> Open the staff portal <Icon name="chevron-right" size={16} />
          </Link>
        )}
      </section>

      <SignOutButton userId={user.id} />
    </div>
  );
}
