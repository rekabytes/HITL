import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { actions, rooms, users } from "@hitl/db";
import { energyEstimate, THERMAL_VOTE_LABELS } from "@hitl/shared";
import { ActionForm } from "@/components/ActionForm";
import { AiInsightsPanel } from "@/components/AiInsights";
import { Icon, type IconName } from "@/components/Icon";
import { Badge, Empty, PageHeader, PanelHead } from "@/components/ui";
import { VoteBadge } from "@/components/VoteBadge";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listInsights } from "@/lib/insights";
import { env } from "@/lib/env";
import { roomStatuses } from "@/lib/readings";
import { formatDateTime, timeAgo } from "@/lib/time";
import { logActionAction } from "../actions";

export const metadata: Metadata = { title: "Recommendations" };

const LEVEL = {
  ok: { tone: "ok", text: "All good", icon: "check-circle" },
  advice: { tone: "warn", text: "Advice", icon: "info" },
  action: { tone: "danger", text: "Act now", icon: "alert-triangle" },
} as const satisfies Record<string, { tone: "ok" | "warn" | "danger"; text: string; icon: IconName }>;

export default async function RecommendationsPage() {
  await requireStaff();
  const [statuses, insights, recent] = await Promise.all([
    roomStatuses({ withPrediction: true }),
    listInsights(),
    db()
      .select({ id: actions.id, note: actions.note, createdAt: actions.createdAt, code: rooms.code, by: users.name })
      .from(actions)
      .leftJoin(rooms, eq(rooms.id, actions.roomId))
      .leftJoin(users, eq(users.id, actions.userId))
      .orderBy(desc(actions.createdAt))
      .limit(15),
  ]);
  // Rooms that need attention first.
  const order = { action: 0, advice: 1, ok: 2 } as const;
  const sorted = [...statuses].sort(
    (a, b) => (a.recommendation ? order[a.recommendation.level] : 3) - (b.recommendation ? order[b.recommendation.level] : 3),
  );

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "zap", text: "Monitor" }}
        title="Recommendations"
        sub="Advice combines the comfort band with recent votes. The model score is the predicted chance that an occupant votes perfect."
      />
      {insights.map((i) => (
        <AiInsightsPanel key={i.roomId} data={i} />
      ))}
      {insights.length > 0 && <div className="mt" />}
      {statuses.length === 0 && (
        <section className="panel">
          <Empty icon="home">No rooms yet.</Empty>
        </section>
      )}
      <div className="grid grid-2">
        {sorted.map((s) => {
          const level = s.recommendation ? LEVEL[s.recommendation.level] : null;
          return (
            <section key={s.room.id} className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <div>
                  <h2>{s.room.code}</h2>
                  <div className="cell-sub" style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Icon name="map-pin" size={12} />
                    {s.room.name} · {s.room.buildingName}
                  </div>
                </div>
                {level ? (
                  <Badge tone={level.tone} icon={level.icon}>{level.text}</Badge>
                ) : (
                  <Badge icon="wifi-off">No recent data</Badge>
                )}
              </div>

              {s.fresh && s.latest ? (
                <>
                  <div className="metrics" style={{ margin: 0 }}>
                    <div className="metric">
                      <div className="m-label"><Icon name="thermometer" size={12} />Temperature</div>
                      <div className="m-value">{s.latest.temperatureC.toFixed(1)}<small>°C</small></div>
                    </div>
                    <div className="metric">
                      <div className="m-label"><Icon name="droplet" size={12} />Humidity</div>
                      <div className="m-value">{s.latest.humidityPct.toFixed(0)}<small>%</small></div>
                    </div>
                  </div>
                  <div className="votes" title="Votes in the last 30 minutes">
                    <VoteBadge vote="too_cold" count={s.tally.tooCold} />
                    <VoteBadge vote="perfect" count={s.tally.perfect} />
                    <VoteBadge vote="too_hot" count={s.tally.tooHot} />
                    <span className="tiny faint" style={{ alignSelf: "center" }}>
                      last 30 min · read {timeAgo(s.latest.recordedAt)}
                      {s.latest.sensorCount > 1 && ` · avg of ${s.latest.sensorCount} sensors`}
                    </span>
                  </div>
                  <ul className="list">
                    {s.recommendation!.items.map((item) => (
                      <li key={item}>
                        <Icon name="chevron-right" size={14} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <dl className="kv">
                    <dt>Energy</dt>
                    <dd><EnergyLine temperatureC={s.latest.temperatureC} /></dd>
                    <dt>Model</dt>
                    <dd>
                      {s.prediction ? (
                        <>
                          {Math.round(s.prediction.comfortScore * 100)}% comfort, likely &ldquo;{THERMAL_VOTE_LABELS[s.prediction.predictedVote]}&rdquo;
                          <span className="faint"> · {s.prediction.model === "random_forest" ? "trained" : "rule estimate"}</span>
                        </>
                      ) : (
                        <span className="faint">Unavailable right now</span>
                      )}
                    </dd>
                  </dl>
                </>
              ) : (
                <Empty icon="wifi-off">No reading in the last 30 minutes. Check the sensor.</Empty>
              )}

              <ActionForm action={logActionAction} submitLabel="Log action" icon="edit-3" variant="ghost" size="sm">
                <input type="hidden" name="roomId" value={s.room.id} />
                <textarea name="note" placeholder="What did you do? For example: set AC to 23 °C." maxLength={2000} />
              </ActionForm>
            </section>
          );
        })}
      </div>

      <section className="panel panel-flush mt">
        <PanelHead icon="edit-3" title="Recent actions" count={recent.length} />
        {recent.length === 0 ? (
          <Empty icon="edit-3">Nothing logged yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Room</th>
                  <th>What was done</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id}>
                    <td className="small nowrap muted">{formatDateTime(a.createdAt)}</td>
                    <td className="cell-title">{a.code ?? "—"}</td>
                    <td>{a.note}</td>
                    <td className="small muted nowrap">{a.by ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EnergyLine({ temperatureC }: { temperatureC: number }) {
  const e = energyEstimate(temperatureC, env.bands);
  if (e.status === "ok") return <Badge tone="ok" icon="check">No overcooling</Badge>;
  return (
    <>
      <Badge tone="warn" icon="wind">Overcooling</Badge>{" "}
      <span className="small">
        {e.degreesBelow} °C below the band, about {e.extraCoolingPct}% extra cooling
      </span>
    </>
  );
}
