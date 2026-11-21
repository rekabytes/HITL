import type { Metadata } from "next";
import { count, desc, isNotNull } from "drizzle-orm";
import { feedback, modelRuns } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { Badge, EmptyRow, PageHeader, PanelHead, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mlHealth } from "@/lib/ml";
import { formatDateTime } from "@/lib/time";
import { retrainAction } from "./actions";

export const metadata: Metadata = { title: "Comfort model" };

const STATUS_TONE = { succeeded: "ok", skipped: "warn", failed: "danger", running: "neutral" } as const;

function pct(v: unknown) {
  return typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";
}

export default async function ModelPage() {
  await requireAdmin();
  const [runs, [labelled], [allVotes], ml] = await Promise.all([
    db().select().from(modelRuns).orderBy(desc(modelRuns.startedAt)).limit(20),
    db().select({ n: count() }).from(feedback).where(isNotNull(feedback.temperatureC)),
    db().select({ n: count() }).from(feedback),
    mlHealth(),
  ]);
  const best = runs.find((r) => r.status === "succeeded");

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "trending-up", text: "Insights" }}
        title="Comfort model"
        sub="A random forest that learns, from occupant votes and the room conditions at that moment, how likely people are to call a room comfortable."
      >
        <ActionForm action={retrainAction} submitLabel="Retrain now" icon="refresh-cw" className="form-inline" />
      </PageHeader>

      <div className="stats">
        <Stat icon="database" label="Labelled votes" value={labelled?.n ?? 0} unit={`/ ${allVotes?.n ?? 0}`} hint="Votes with a reading attached" />
        <Stat icon="check-circle" label="Accuracy" value={pct(best?.metrics?.accuracy)} hint="On held-out votes" />
        <Stat icon="bar-chart-2" label="Macro F1" value={pct(best?.metrics?.f1_macro)} hint="Balanced across vote types" />
        <Stat
          icon="server"
          label="Service"
          value={ml.ok ? (ml.model === "random_forest" ? "Trained" : "Rules") : "Down"}
          tone={ml.ok ? undefined : "danger"}
          hint={ml.trainedAt ? `Trained ${formatDateTime(ml.trainedAt)}` : "Not trained yet"}
        />
      </div>

      <section className="panel">
        <PanelHead icon="info" title="How it learns" />
        <p className="small muted" style={{ lineHeight: 1.6, maxWidth: 820 }}>
          A vote gets a reading attached when the room had a sensor reading in the 30 minutes before it. The model retrains by
          itself after every 50 new labelled votes. It needs at least 30 votes in two or more classes; until then the service
          answers with a simple rule-based estimate.
        </p>
      </section>

      <section className="panel panel-flush">
        <PanelHead icon="activity" title="Runs" count={runs.length} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th className="num">Votes</th>
                <th className="num">Accuracy</th>
                <th className="num">Macro F1</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && <EmptyRow colSpan={6} icon="activity">No runs yet.</EmptyRow>}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small nowrap">{formatDateTime(r.startedAt)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>
                  </td>
                  <td className="num">{r.trainingRows}</td>
                  <td className="num">{pct(r.metrics?.accuracy)}</td>
                  <td className="num">{pct(r.metrics?.f1_macro)}</td>
                  <td className="small muted">{r.error ?? r.algorithm ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
