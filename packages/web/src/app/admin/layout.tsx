import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { navCounts } from "@/lib/nav";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  const counts = await navCounts();
  return (
    <Shell user={user} counts={counts}>
      {children}
    </Shell>
  );
}
