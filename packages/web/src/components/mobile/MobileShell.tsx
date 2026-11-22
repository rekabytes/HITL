import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import { Brand, initials } from "../ui";
import { MobileNav } from "./MobileNav";
import { QueueStatus } from "./QueueStatus";

/** Phone layout for occupants: brand bar on top, content, tab bar at the bottom. */
export function MobileShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="m-shell">
      <header className="m-top">
        <Link href="/app" className="brand">
          <Brand sub="Room comfort" />
        </Link>
        <Link href="/app/account" className="avatar" aria-label={`Account: ${user.name}`}>
          {initials(user.name)}
        </Link>
      </header>
      <QueueStatus userId={user.id} />
      <main className="m-main">{children}</main>
      <MobileNav />
    </div>
  );
}
