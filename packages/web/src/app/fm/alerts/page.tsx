import type { Metadata } from "next";
import { desc, eq, ne } from "drizzle-orm";
import { alerts, rooms, users } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms } from "@/lib/readings";
import { formatDateTime } from "@/lib/time";
import { checkOfflineSensors, escalateStaleAlerts } from "@/lib/alerts";
import { env } from "@/lib/env";
import { acknowledgeAlertAction, createAlertAction, renotifyAlertAction, resolveAlertAction } from "../actions";

export const metadata: Metadata = { title: "Alerts" };

const SEVERITY = { info: "badge", warning: "badge badge-warn", critical: "badge badge-danger" } as const;
const KIND = {
  temperature: "Temperature",
  humidity: "Humidity",
  feedback: "Occupant votes",
  sensor_offline: "Sensor offline",
  manual: "Reported",
} as const;

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
        title="Alerts"
        sub={`Raised automatically from readings, votes and quiet sensors, or reported by staff. The room's person in charge is emailed when an alert opens, and again as an escalation if nobody acknowledges it within ${env.escalateAfterMin} minutes.`}
      />
      <section className="panel">
        <h2>Open ({open.length})</h2>
        {open.length === 0 ? (
          <p className="empty">Nothing open.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th>Resolve</th>
                </tr>
              </thead>
              <tbody>
                {open.map(({ alert: a, code, roomName }) => (
                  <tr key={a.id}>
                    <td className="small">{formatDateTime(a.createdAt)}</td>
                    <td>
                      <strong>{code ?? "—"}</strong>
                      {roomName && <div className="small muted">{roomName}</div>}
                    </td>
                    <td>
                      <span className={SEVERITY[a.severity]}>{a.severity}</span>
                      {a.escalatedAt && <span className="badge badge-danger" style={{ marginLeft: 4 }}>escalated</span>}
                      <div className="small muted">{KIND[a.kind]}</div>
                    </td>
                    <td>{a.message}</td>
                    <td>
                      {a.status === "open" ? (
                        <ActionForm action={acknowledgeAlertAction} submitLabel="Acknowledge" variant="ghost" className="form-inline">
                          <input type="hidden" name="id" value={a.id} />
                        </ActionForm>
                      ) : (
                        <span className="badge">seen {a.acknowledgedAt ? formatDateTime(a.acknowledgedAt) : ""}</span>
                      )}
                    </td>
                    <td>
                      <div className="small muted">
                        {a.notifyCount > 0 ? `Sent ${a.notifyCount}×, last ${formatDateTime(a.lastNotifiedAt)}` : "Not sent"}
                      </div>
                      <ActionForm action={renotifyAlertAction} submitLabel="Re-notify" variant="ghost" className="form-inline">
                        <input type="hidden" name="id" value={a.id} />
                      </ActionForm>
                    </td>
                    <td>
                      <ActionForm action={resolveAlertAction} submitLabel="Resolve" className="form-inline">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="note" placeholder="what fixed it" required maxLength={2000} />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Report a problem</h2>
        <ActionForm action={createAlertAction} submitLabel="Open alert">
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
        <h2>Recently resolved</h2>
        {resolved.length === 0 ? (
          <p className="empty">None yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resolved</th>
                  <th>Room</th>
                  <th>Message</th>
                  <th>Fix</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(({ alert: a, code, resolver }) => (
                  <tr key={a.id}>
                    <td className="small">{formatDateTime(a.resolvedAt)}</td>
                    <td><strong>{code ?? "—"}</strong></td>
                    <td>{a.message}</td>
                    <td>{a.resolutionNote}</td>
                    <td className="small muted">{resolver ?? ""}</td>
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
