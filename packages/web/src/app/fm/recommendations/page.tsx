import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { actions, rooms, users } from "@hitl/db";
import { THERMAL_VOTE_LABELS } from "@hitl/shared";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { roomStatuses } from "@/lib/readings";
import { formatDateTime, timeAgo } from "@/lib/time";
import { logActionAction } from "../actions";

export const metadata: Metadata = { title: "Recommendations" };

const LEVEL = {
  ok: { cls: "badge-ok", text: "OK" },
  advice: { cls: "badge-warn", text: "Advice" },
  action: { cls: "badge-danger", text: "Act now" },
} as const;

export default async function RecommendationsPage() {
  await requireStaff();
  const [statuses, recent] = await Promise.all([
    roomStatuses({ withPrediction: true }),
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
        title="Recommendations"
        sub="Advice combines the comfort band with recent votes. The model score is the predicted chance that an occupant votes perfect."
      />
      <div className="grid grid-2">
        {sorted.map((s) => (
          <section key={s.room.id} className="panel">
            <div className="page-header" style={{ marginBottom: "0.75rem" }}>
              <div>
                <h2 style={{ marginBottom: 0 }}>{s.room.code}</h2>
                <p className="sub small">
                  {s.room.name} · {s.room.buildingName}
                </p>
              </div>
              {s.recommendation ? (
                <span className={`badge ${LEVEL[s.recommendation.level].cls}`}>{LEVEL[s.recommendation.level].text}</span>
              ) : (
                <span className="badge">no recent data</span>
              )}
            </div>
            {s.fresh && s.latest ? (
              <>
                <p className="small">
                  <strong>{s.latest.temperatureC.toFixed(1)} °C</strong>, {s.latest.humidityPct.toFixed(0)}% RH,{" "}
                  {timeAgo(s.latest.recordedAt)}. Votes in the last 30 min: {s.tally.tooCold} cold, {s.tally.perfect} perfect,{" "}
                  {s.tally.tooHot} hot.
                </p>
                <ul className="list">
                  {s.recommendation!.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="small muted">
                  {s.prediction
                    ? `Model (${s.prediction.model === "random_forest" ? "trained" : "rule estimate"}): ${Math.round(
                        s.prediction.comfortScore * 100,
                      )}% comfort, most likely vote "${THERMAL_VOTE_LABELS[s.prediction.predictedVote]}".`
                    : "Model unavailable right now."}
                </p>
              </>
            ) : (
              <p className="muted small">No reading in the last 30 minutes. Check the sensor.</p>
            )}
            <ActionForm action={logActionAction} submitLabel="Log action" variant="ghost">
              <input type="hidden" name="roomId" value={s.room.id} />
              <textarea name="note" placeholder="What did you do? For example: set AC to 23 °C." maxLength={2000} />
            </ActionForm>
          </section>
        ))}
      </div>
      {statuses.length === 0 && <p className="panel empty">No rooms yet.</p>}
      <section className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>Recent actions</h2>
        {recent.length === 0 ? (
          <p className="empty">Nothing logged yet.</p>
        ) : (
          <table>
            <tbody>
              {recent.map((a) => (
                <tr key={a.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{formatDateTime(a.createdAt)}</td>
                  <td><strong>{a.code ?? "—"}</strong></td>
                  <td>{a.note}</td>
                  <td className="small muted">{a.by ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
