import type { Metadata } from "next";
import { and, count, gt, ne } from "drizzle-orm";
import { alerts, feedback } from "@hitl/db";
import { LiveRooms, type LiveRoom } from "@/components/LiveRooms";
import { PageHeader } from "@/components/Shell";
import { checkOfflineSensors } from "@/lib/alerts";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { roomStatuses } from "@/lib/readings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function FmDashboard() {
  await requireStaff();
  await checkOfflineSensors();
  const day = new Date(Date.now() - 86_400_000);
  const [statuses, openByRoom, [votes24h], [uncomfortable24h]] = await Promise.all([
    roomStatuses(),
    db().select({ roomId: alerts.roomId, n: count() }).from(alerts).where(ne(alerts.status, "resolved")).groupBy(alerts.roomId),
    db().select({ n: count() }).from(feedback).where(gt(feedback.createdAt, day)),
    db().select({ n: count() }).from(feedback).where(and(gt(feedback.createdAt, day), ne(feedback.vote, "perfect"))),
  ]);

  const initial: LiveRoom[] = statuses.map((s) => ({
    id: s.room.id,
    code: s.room.code,
    name: s.room.name,
    buildingName: s.room.buildingName,
    temperatureC: s.latest?.temperatureC ?? null,
    humidityPct: s.latest?.humidityPct ?? null,
    recordedAt: s.latest?.recordedAt ?? null,
    level: s.recommendation?.level ?? "none",
    advice: s.recommendation && s.recommendation.level !== "ok" ? (s.recommendation.items[0] ?? null) : null,
    votes: s.tally,
    openAlerts: openByRoom.find((a) => a.roomId === s.room.id)?.n ?? 0,
  }));

  const live = statuses.filter((s) => s.fresh);
  const avg = (pick: (s: (typeof live)[number]) => number) =>
    live.length ? (live.reduce((sum, s) => sum + pick(s), 0) / live.length).toFixed(1) : "—";
  const openTotal = openByRoom.reduce((sum, a) => sum + a.n, 0);
  const total24 = votes24h?.n ?? 0;
  const unhappy = uncomfortable24h?.n ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" sub="Live room conditions next to what occupants are saying." />
      <div className="stats">
        <div className="stat">
          <div className="label">Rooms reporting</div>
          <div className="value">{live.length} / {statuses.length}</div>
        </div>
        <div className="stat">
          <div className="label">Avg temperature</div>
          <div className="value">{avg((s) => s.latest!.temperatureC)} °C</div>
        </div>
        <div className="stat">
          <div className="label">Avg humidity</div>
          <div className="value">{avg((s) => s.latest!.humidityPct)}%</div>
        </div>
        <div className="stat">
          <div className="label">Votes, last 24 h</div>
          <div className="value">{total24}</div>
          <div className="hint">{total24 ? `${Math.round(((total24 - unhappy) / total24) * 100)}% said perfect` : "no votes yet"}</div>
        </div>
        <div className="stat">
          <div className="label">Open alerts</div>
          <div className="value">{openTotal}</div>
        </div>
      </div>
      <LiveRooms initial={initial} />
    </>
  );
}
