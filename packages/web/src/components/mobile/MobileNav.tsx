"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/app", label: "Home", icon: "home", match: (p) => p === "/app" },
  { href: "/app/scan", label: "Scan", icon: "maximize", match: (p) => p.startsWith("/app/scan") || p.startsWith("/r/") },
  { href: "/app/history", label: "My votes", icon: "list", match: (p) => p.startsWith("/app/history") },
  { href: "/app/account", label: "Account", icon: "user", match: (p) => p.startsWith("/app/account") },
];

export function MobileNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="m-tabs" aria-label="Main">
      {TABS.map((t) => {
        const active = t.match(path);
        return (
          <Link key={t.href} href={t.href} className={active ? "m-tab active" : "m-tab"} aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
