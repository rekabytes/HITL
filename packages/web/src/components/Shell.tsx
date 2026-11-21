import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import type { SessionUser } from "@/lib/auth";
import { NavLink } from "./NavLink";

const FM_LINKS = [
  { href: "/fm", label: "Dashboard" },
  { href: "/fm/feedback", label: "Feedback log" },
  { href: "/fm/analytics", label: "Analytics" },
  { href: "/fm/recommendations", label: "Recommendations" },
  { href: "/fm/alerts", label: "Alerts" },
  { href: "/fm/sensors", label: "Sensors" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/rooms", label: "Rooms and sensors" },
  { href: "/admin/pics", label: "Persons in charge" },
  { href: "/admin/model", label: "Comfort model" },
];

const ROLE_LABEL = { admin: "Admin", facility_manager: "Facility manager", occupant: "Occupant" } as const;

export function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          HITL <span>Smart Building</span>
        </Link>
        {user.role === "admin" && (
          <nav>
            <p className="nav-title">Administration</p>
            {ADMIN_LINKS.map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
        <nav>
          <p className="nav-title">Facility management</p>
          {FM_LINKS.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="who">
            {user.name}
            <span>{ROLE_LABEL[user.role]}</span>
          </p>
          <Link href="/change-password" className="link-muted">
            Change password
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-block">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
