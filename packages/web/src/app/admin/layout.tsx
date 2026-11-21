import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return <Shell user={user}>{children}</Shell>;
}
