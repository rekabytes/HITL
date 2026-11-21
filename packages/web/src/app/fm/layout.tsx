import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FmLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  return <Shell user={user}>{children}</Shell>;
}
