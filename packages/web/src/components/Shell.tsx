import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import type { SessionUser } from "@/lib/auth";
import { Icon, type IconName } from "./Icon";
import { NavLink } from "./NavLink";
import { Brand, initials } from "./ui";

export { PageHeader } from "./ui";

const FM_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/fm", label: "Dashboard", icon: "grid" },
  { href: "/fm/feedback", label: "Feedback log", icon: "message-square" },
  { href: "/fm/analytics", label: "Analytics", icon: "bar-chart-2" },
  { href: "/fm/recommendations", label: "Recommendations", icon: "zap" },
  { href: "/fm/alerts", label: "Alerts", icon: "bell" },
  { href: "/fm/sensors", label: "Sensors", icon: "cpu" },
];

const ADMIN_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "layout" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/rooms", label: "Rooms and sensors", icon: "home" },
  { href: "/admin/pics", label: "Persons in charge", icon: "user-check" },
  { href: "/admin/model", label: "Comfort model", icon: "trending-up" },
];

const ROLE_LABEL = { admin: "Admin", facility_manager: "Facility manager", occupant: "Occupant" } as const;

export function Shell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Brand />
        </Link>
        {user.role === "admin" && (
          <nav className="nav" aria-label="Administration">
            <p className="nav-title">Administration</p>
            {ADMIN_LINKS.map((l) => (
              <NavLink key={l.href} href={l.href} icon={l.icon}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
        <nav className="nav" aria-label="Facility management">
          <p className="nav-title">Facility management</p>
          {FM_LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} icon={l.icon}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="who">
              <strong title={user.email}>{user.name}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <div className="side-row">
              <Link href="/change-password" className="icon-btn-side" title="Change password" aria-label="Change password">
                <Icon name="lock" size={15} />
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="icon-btn-side" title="Sign out" aria-label="Sign out">
                  <Icon name="log-out" size={15} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
