import { count, ne } from "drizzle-orm";
import { alerts } from "@hitl/db";
import { db } from "./db";
import { openSuggestionCount } from "./insights";

export interface NavCounts {
  /** Alerts not yet resolved. */
  alerts: number;
  /** AI suggestions waiting for Accept or Dismiss. */
  suggestions: number;
}

/** Counts shown as badges in the sidebar. Cheap enough to run on every page. */
export async function navCounts(): Promise<NavCounts> {
  const [[open], suggestions] = await Promise.all([
    db().select({ n: count() }).from(alerts).where(ne(alerts.status, "resolved")),
    openSuggestionCount(),
  ]);
  return { alerts: open?.n ?? 0, suggestions };
}
