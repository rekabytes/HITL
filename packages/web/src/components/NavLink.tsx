"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  // "/fm" and "/admin" are section roots: only exact matches count as active.
  const active = href === "/fm" || href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
