"use client";

import type { FormEvent } from "react";
import { logoutAction } from "@/app/actions";
import { clearQueue, queuedCount } from "@/lib/vote-queue";
import { Icon } from "../Icon";

/** Signs out and wipes what this phone kept for the user: unsent votes and cached screens. */
export function SignOutButton({ userId }: { userId: string }) {
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    const waiting = queuedCount(userId);
    if (waiting > 0 && !confirm(`${waiting} unsent ${waiting === 1 ? "vote is" : "votes are"} saved on this phone and will be lost. Sign out anyway?`)) {
      e.preventDefault();
      return;
    }
    clearQueue(userId);
    try {
      for (const key of await caches.keys()) if (key.startsWith("hitl-pages")) await caches.delete(key);
    } catch {
      // Cache Storage missing (old browser, insecure origin): nothing cached to clear.
    }
  }

  return (
    <form action={logoutAction} onSubmit={onSubmit}>
      <button type="submit" className="btn btn-ghost btn-block">
        <Icon name="log-out" size={15} />
        Sign out
      </button>
    </form>
  );
}
