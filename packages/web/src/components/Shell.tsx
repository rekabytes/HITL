import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import type { SessionUser } from "@/lib/auth";
import type { NavCounts } from "@/lib/nav";
import { Icon, type IconName } from "./Icon";
import { NavLink } from "./NavLink";
import { Brand, initials } from "./ui";

export { PageHeader } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Which live count to show next to the link. */
  count?: keyof NavCounts;
  adminOnly?: boolean;
}

interface NavGroup {
  title?: string;
  adminOnly?: boolean;
  items: NavItem[];
}

/**
 * Grouped by what people do, not by role: the dashboard first, then the
 * pages that need action, then the pages for looking back, then setup.
 */
const NAV: NavGroup[] = [
  { items: [{ href: "/fm", label: "Dashboard", icon: "grid" }] },
  {
    title: "Monitor",
    items: [
      { href: "/fm/alerts", label: "Alerts", icon: "bell", count: "alerts" },
      { href: "/fm/recommendations", label: "Recommendations", icon: "zap", count: "suggestions" },
      { href: "/fm/sensors", label: "Sensor status", icon: "wifi" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/fm/feedback", label: "Feedback log", icon: "message-square" },
      { href: "/fm/analytics", label: "Analytics", icon: "bar-chart-2" },
      { href: "/admin/model", label: "Comfort model", icon: "trending-up", adminOnly: true },
    ],
  },
  {
    title: "Setup",
    adminOnly: true,
    items: [
      { href: "/admin/rooms", label: "Rooms and sensors", icon: "home" },
      { href: "/admin/pics", label: "Persons in charge", icon: "user-check" },
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin", label: "System overview", icon: "layout" },
    ],
  },
];

const ROLE_LABEL = { admin: "Admin", facility_manager: "Facility manager", occupant: "Occupant" } as const;

export function Shell({ user, counts, children }: { user: SessionUser; counts: NavCounts; children: ReactNode }) {
  const isAdmin = user.role === "admin";
  const groups = NAV.filter((g) => isAdmin || !g.adminOnly)
    .map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/fm" className="brand">
          <Brand />
        </Link>
        <div className="nav-groups">
          {groups.map((g, gi) => (
            <nav key={g.title ?? gi} className="nav" aria-label={g.title ?? "Main"}>
              {g.title && <p className="nav-title">{g.title}</p>}
              {g.items.map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  icon={l.icon}
                  count={l.count ? counts[l.count] : undefined}
                  urgent={l.count === "alerts"}
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          ))}
        </div>
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
