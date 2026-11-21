import type { Metadata } from "next";
import { desc, eq, ne } from "drizzle-orm";
import { alerts, rooms, users } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { Icon, type IconName } from "@/components/Icon";
import { Badge, Empty, PageHeader, PanelHead } from "@/components/ui";
import { checkOfflineSensors, escalateStaleAlerts } from "@/lib/alerts";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { listRooms } from "@/lib/readings";
import { formatDateTime, timeAgo } from "@/lib/time";
import { acknowledgeAlertAction, createAlertAction, renotifyAlertAction, resolveAlertAction } from "../actions";

export const metadata: Metadata = { title: "Alerts" };

const SEVERITY = {
  info: { tone: "neutral", icon: "info" },
  warning: { tone: "warn", icon: "alert-circle" },
  critical: { tone: "danger", icon: "alert-triangle" },
} as const satisfies Record<string, { tone: "neutral" | "warn" | "danger"; icon: IconName }>;

const KIND: Record<string, { label: string; icon: IconName }> = {
  temperature: { label: "Temperature", icon: "thermometer" },
  humidity: { label: "Humidity", icon: "droplet" },
  feedback: { label: "Occupant votes", icon: "message-square" },
  sensor_offline: { label: "Sensor offline", icon: "wifi-off" },
  manual: { label: "Reported by staff", icon: "user" },
};

export default async function AlertsPage() {
  await requireStaff();
  await checkOfflineSensors();
  await escalateStaleAlerts();
  const base = () =>
    db()
      .select({ alert: alerts, code: rooms.code, roomName: rooms.name, resolver: users.name })
      .from(alerts)
      .leftJoin(rooms, eq(rooms.id, alerts.roomId))
      .leftJoin(users, eq(users.id, alerts.resolvedBy));
  const [open, resolved, roomRows] = await Promise.all([
    base().where(ne(alerts.status, "resolved")).orderBy(desc(alerts.createdAt)),
    base().where(eq(alerts.status, "resolved")).orderBy(desc(alerts.resolvedAt)).limit(50),
    listRooms(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "bell", text: "Monitor" }}
        title="Alerts"
        sub={`Raised from readings, votes and quiet sensors, or reported by staff. The person in charge is emailed when an alert opens, and again as an escalation if nobody acknowledges it within ${env.escalateAfterMin} minutes.`}
      />

      <section className="panel">
        <PanelHead icon="bell" title="Open" count={open.length} />
        {open.length === 0 ? (
          <Empty icon="check-circle">Nothing open. All rooms are fine.</Empty>
        ) : (
          <div className="alert-list">
            {open.map(({ alert: a, code, roomName }) => {
              const sev = SEVERITY[a.severity];
              const kind = KIND[a.kind]!;
              return (
                <article key={a.id} className={`alert-item sev-${a.severity}`}>
                  <span className={`alert-icon sev-${a.severity}`}>
                    <Icon name={sev.icon} size={18} />
                  </span>
                  <div className="alert-body">
                    <div className="alert-top">
                      <strong>{code ?? "No room"}</strong>
                      {roomName && <span className="muted small">{roomName}</span>}
                      <Badge tone={sev.tone}>{a.severity}</Badge>
                      {a.escalatedAt && <Badge tone="danger" icon="alert-triangle">Escalated</Badge>}
                      {a.status === "acknowledged" && <Badge icon="eye">Seen</Badge>}
                    </div>
                    <p className="alert-msg">{a.message}</p>
                    <div className="alert-meta">
                      <span><Icon name={kind.icon} size={12} />{kind.label}</span>
                      <span title={formatDateTime(a.createdAt)}><Icon name="clock" size={12} />{timeAgo(a.createdAt)}</span>
                      <span>
                        <Icon name="mail" size={12} />
                        {a.notifyCount > 0 ? `Emailed ${a.notifyCount}×, last ${timeAgo(a.lastNotifiedAt)}` : "Not emailed"}
                      </span>
                    </div>
                  </div>
                  <div className="alert-actions">
                    <div className="form-inline">
                      {a.status === "open" && (
                        <ActionForm action={acknowledgeAlertAction} submitLabel="Acknowledge" icon="eye" variant="ghost" size="sm" className="form-inline">
                          <input type="hidden" name="id" value={a.id} />
                        </ActionForm>
                      )}
                      <ActionForm action={renotifyAlertAction} submitLabel="Re-notify" icon="send" variant="ghost" size="sm" className="form-inline">
                        <input type="hidden" name="id" value={a.id} />
                      </ActionForm>
                    </div>
                    <ActionForm action={resolveAlertAction} submitLabel="Resolve" icon="check" size="sm" className="form-inline">
                      <input type="hidden" name="id" value={a.id} />
                      <input name="note" placeholder="What fixed it?" required maxLength={2000} className="input-sm" />
                    </ActionForm>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-2 mt">
        <section className="panel">
          <PanelHead icon="plus" title="Report a problem" />
          <ActionForm action={createAlertAction} submitLabel="Open alert" icon="bell">
            <div className="form-row">
              <label>
                Room
                <select name="roomId" required>
                  {roomRows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Severity
                <select name="severity" defaultValue="warning">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>
            <label>
              Message
              <textarea name="message" required maxLength={1000} placeholder="AC unit leaking near the window" />
            </label>
          </ActionForm>
        </section>

        <section className="panel">
          <PanelHead icon="check-circle" title="Recently resolved" count={resolved.length} />
          {resolved.length === 0 ? (
            <Empty icon="check-circle">None yet.</Empty>
          ) : (
            <ul className="timeline">
              {resolved.map(({ alert: a, code, resolver }) => (
                <li key={a.id}>
                  <span className="tl-dot"><Icon name="check" size={11} strokeWidth={3} /></span>
                  <div>
                    <div className="small">
                      <strong>{code ?? "—"}</strong> <span className="muted">{a.message}</span>
                    </div>
                    {a.resolutionNote && <div className="small" style={{ marginTop: 2 }}>{a.resolutionNote}</div>}
                    <div className="tiny faint" style={{ marginTop: 2 }}>
                      {formatDateTime(a.resolvedAt)}{resolver ? ` · ${resolver}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
