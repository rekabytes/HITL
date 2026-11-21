import Link from "next/link";
import { decideSuggestionAction } from "@/app/fm/actions";
import type { RoomInsights } from "@/lib/insights";
import { formatDateTime, timeAgo } from "@/lib/time";
import { ActionForm } from "./ActionForm";
import { Icon, type IconName } from "./Icon";
import { Badge } from "./ui";

const PRIORITY: Record<"low" | "medium" | "high", { tone: "neutral" | "warn" | "danger"; icon: IconName; label: string }> = {
  high: { tone: "danger", icon: "alert-triangle", label: "High" },
  medium: { tone: "warn", icon: "alert-circle", label: "Medium" },
  low: { tone: "neutral", icon: "info", label: "Low" },
};

function SourceBadge({ source }: { source: "demo" | "model" | "llm" }) {
  if (source === "demo") return <Badge tone="warn" icon="info">Demo data</Badge>;
  return <Badge icon="zap">{source === "llm" ? "AI" : "Model"}</Badge>;
}

/** Full AI insights for one room: summary, open suggestions with Accept / Dismiss, and recent decisions. */
export function AiInsightsPanel({ data }: { data: RoomInsights }) {
  return (
    <section className="panel ai-panel">
      <div className="panel-head">
        <h2>
          <span className="ai-mark">
            <Icon name="zap" size={14} strokeWidth={2.4} />
          </span>
          AI insights <span className="count">{data.code}</span>
        </h2>
        {data.summary && <SourceBadge source={data.summary.source} />}
      </div>

      {data.summary && (
        <div className="ai-summary">
          <div className="ai-summary-head">
            <strong>{data.summary.title}</strong>
            <span className="tiny faint" title={formatDateTime(data.summary.createdAt)}>
              {timeAgo(data.summary.createdAt)}
            </span>
          </div>
          {data.summary.body.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      <div className="ai-suggestions">
        <div className="ai-sub">
          <Icon name="check-circle" size={14} />
          Suggestions
          <span className="count">{data.open.length} open</span>
        </div>
        {data.open.length === 0 && <p className="small muted">No open suggestions.</p>}
        {data.open.map((s) => {
          const p = PRIORITY[s.priority];
          return (
            <article key={s.id} className={`ai-card prio-${s.priority}`}>
              <span className={`ai-card-icon prio-${s.priority}`}>
                <Icon name={p.icon} size={16} />
              </span>
              <div className="ai-card-body">
                <div className="ai-card-top">
                  <strong>{s.title}</strong>
                  <Badge tone={p.tone}>{p.label}</Badge>
                </div>
                <p>{s.body}</p>
              </div>
              <div className="ai-card-actions">
                <ActionForm action={decideSuggestionAction} submitLabel="Accept" icon="check" size="sm" className="form-inline">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="decision" value="accepted" />
                </ActionForm>
                <ActionForm action={decideSuggestionAction} submitLabel="Dismiss" icon="x" variant="ghost" size="sm" className="form-inline">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="decision" value="dismissed" />
                </ActionForm>
              </div>
            </article>
          );
        })}
      </div>

      {data.decided.length > 0 && (
        <div className="ai-decided">
          <div className="ai-sub">
            <Icon name="clock" size={14} />
            Recently decided
          </div>
          <ul className="timeline">
            {data.decided.map((d) => (
              <li key={d.id}>
                <span className={`tl-dot ${d.status === "dismissed" ? "tl-muted" : ""}`}>
                  <Icon name={d.status === "accepted" ? "check" : "x"} size={11} strokeWidth={3} />
                </span>
                <div>
                  <div className="small">
                    <strong>{d.title}</strong>
                  </div>
                  <div className="tiny faint" style={{ marginTop: 2 }}>
                    {d.status === "accepted" ? "Accepted" : "Dismissed"}
                    {d.decidedByName ? ` by ${d.decidedByName}` : ""} · {formatDateTime(d.decidedAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Compact dashboard card: latest summary line and the top open suggestion. */
export function AiInsightsTeaser({ data }: { data: RoomInsights[] }) {
  const open = data.flatMap((d) => d.open.map((s) => ({ ...s, code: d.code })));
  const top = open[0];
  const summary = data.find((d) => d.summary)?.summary;
  if (!summary && !top) return null;
  return (
    <section className="panel ai-panel ai-teaser">
      <div className="panel-head" style={{ marginBottom: "0.6rem" }}>
        <h2>
          <span className="ai-mark">
            <Icon name="zap" size={14} strokeWidth={2.4} />
          </span>
          AI insights
          <span className="count">{open.length} open suggestions</span>
        </h2>
        <Link href="/fm/recommendations" className="btn btn-ghost btn-sm">
          Review
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>
      {summary && <p className="small" style={{ lineHeight: 1.5 }}>{summary.body.split("\n")[0]}</p>}
      {top && (
        <div className="ai-top">
          <Icon name={PRIORITY[top.priority].icon} size={14} />
          <span>
            <strong>{top.code}:</strong> {top.title}
          </span>
        </div>
      )}
    </section>
  );
}
