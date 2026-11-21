"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function NavLink({
  href,
  icon,
  count,
  urgent,
  children,
}: {
  href: string;
  icon: IconName;
  /** Badge number; hidden when 0 or undefined. */
  count?: number;
  /** Red badge (alerts) instead of the neutral one. */
  urgent?: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  // "/fm" and "/admin" are section roots: only exact matches count as active.
  const active = href === "/fm" || href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
      <Icon name={icon} size={17} />
      <span className="nav-label">{children}</span>
      {!!count && (
        <span className={urgent ? "nav-badge urgent" : "nav-badge"} aria-label={`${count} open`}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
