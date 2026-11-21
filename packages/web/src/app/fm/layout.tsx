import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { navCounts } from "@/lib/nav";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FmLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  const counts = await navCounts();
  return (
    <Shell user={user} counts={counts}>
      {children}
    </Shell>
  );
}
