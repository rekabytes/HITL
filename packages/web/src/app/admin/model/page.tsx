import type { Metadata } from "next";
import { count, desc, isNotNull } from "drizzle-orm";
import { feedback, modelRuns } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mlHealth } from "@/lib/ml";
import { formatDateTime } from "@/lib/time";
import { retrainAction } from "./actions";

export const metadata: Metadata = { title: "Comfort model" };

const STATUS_BADGE: Record<string, string> = {
  succeeded: "badge-ok",
  skipped: "badge-warn",
  failed: "badge-danger",
  running: "",
};

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

  return (
    <>
      <PageHeader
        title="Comfort model"
        sub="A random forest that learns, from occupant votes and the room conditions at that moment, how likely people are to call a room comfortable."
      />
      <div className="grid grid-2">
        <section className="panel">
          <h2>Training data</h2>
          <p>
            <strong>{labelled?.n ?? 0}</strong> of {allVotes?.n ?? 0} votes have a temperature and humidity reading
            attached and can be used for training.
          </p>
          <p className="small muted">
            A vote gets a reading attached when the room had a sensor reading in the 30 minutes before it. The model
            retrains by itself after every 50 new labelled votes. It needs at least 30 votes in two or more classes; until
            then the service answers with a simple rule-based estimate.
          </p>
          <ActionForm action={retrainAction} submitLabel="Retrain now" />
        </section>
        <section className="panel">
          <h2>Service</h2>
          <p>
            {ml.ok ? <span className="badge badge-ok">up</span> : <span className="badge badge-danger">unreachable</span>}{" "}
            {ml.ok && (
              <>
                serving <code>{ml.model}</code>
                {ml.trainedAt && <>, trained {formatDateTime(ml.trainedAt)}</>}
              </>
            )}
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Runs</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Votes</th>
                <th>Accuracy</th>
                <th>Macro F1</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr><td colSpan={6} className="empty">No runs yet.</td></tr>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{formatDateTime(r.startedAt)}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status] ?? ""}`}>{r.status}</span></td>
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
