import type { ReactNode } from "react";
import { MobileShell } from "@/components/mobile/MobileShell";
import { requireUser } from "@/lib/auth";

// Any signed-in role may use the occupant app; staff find it handy for testing a room.
export default async function OccupantLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <MobileShell user={user}>{children}</MobileShell>;
}
