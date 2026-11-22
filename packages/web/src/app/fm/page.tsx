import type { Metadata } from "next";
import { and, count, gt, ne } from "drizzle-orm";
import { alerts, feedback } from "@hitl/db";
import { AiInsightsTeaser } from "@/components/AiInsights";
import { LiveRooms, type LiveRoom } from "@/components/LiveRooms";
import { PageHeader, Stat } from "@/components/ui";
import { checkOfflineSensors, escalateStaleAlerts } from "@/lib/alerts";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listInsights } from "@/lib/insights";
import { roomStatuses } from "@/lib/readings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function FmDashboard() {
  await requireStaff();
  await checkOfflineSensors();
  await escalateStaleAlerts();
  const day = new Date(Date.now() - 86_400_000);
  const [statuses, openByRoom, [votes24h], [uncomfortable24h], insights] = await Promise.all([
    roomStatuses(),
    db().select({ roomId: alerts.roomId, n: count() }).from(alerts).where(ne(alerts.status, "resolved")).groupBy(alerts.roomId),
    db().select({ n: count() }).from(feedback).where(gt(feedback.createdAt, day)),
    db().select({ n: count() }).from(feedback).where(and(gt(feedback.createdAt, day), ne(feedback.vote, "perfect"))),
    listInsights(),
  ]);

  const initial: LiveRoom[] = statuses.map((s) => ({
    id: s.room.id,
    code: s.room.code,
    name: s.room.name,
    buildingName: s.room.buildingName,
    temperatureC: s.latest?.temperatureC ?? null,
    humidityPct: s.latest?.humidityPct ?? null,
    recordedAt: s.latest?.recordedAt ?? null,
    sensorCount: s.latest?.sensorCount ?? 0,
    co2: s.co2,
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
      <PageHeader
        eyebrow={{ icon: "grid", text: "Overview" }}
        title="Dashboard"
        sub="Live room conditions next to what occupants are saying."
      />
      <div className="stats">
        <Stat icon="wifi" label="Rooms reporting" value={statuses.filter((s) => s.fresh || s.co2Fresh).length} unit={`/ ${statuses.length}`} />
        <Stat icon="thermometer" label="Avg temperature" value={avg((s) => s.latest!.temperatureC)} unit="°C" />
        <Stat icon="droplet" label="Avg humidity" value={avg((s) => s.latest!.humidityPct)} unit="%" tone="cold" />
        <Stat
          icon="message-square"
          label="Votes, last 24 h"
          value={total24}
          hint={total24 ? `${Math.round(((total24 - unhappy) / total24) * 100)}% said perfect` : "No votes yet"}
        />
        <Stat icon="bell" label="Open alerts" value={openTotal} tone={openTotal ? "danger" : undefined} />
      </div>
      <AiInsightsTeaser data={insights} />
      <LiveRooms initial={initial} />
    </>
  );
}
