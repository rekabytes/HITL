import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, gt, ne } from "drizzle-orm";
import { alerts, feedback, modelRuns, rooms, sensors, users } from "@hitl/db";
import { Icon } from "@/components/Icon";
import { Badge, PageHeader, PanelHead, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mlHealth } from "@/lib/ml";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "System overview" };

export default async function AdminOverview() {
  await requireAdmin();
  const day = new Date(Date.now() - 86_400_000);
  const online = new Date(Date.now() - 10 * 60_000);
  const [byRole, [roomCount], [sensorCount], [sensorsOnline], [votes24h], [openAlerts], [lastRun], ml] = await Promise.all([
    db().select({ role: users.role, n: count() }).from(users).where(eq(users.active, true)).groupBy(users.role),
    db().select({ n: count() }).from(rooms),
    db().select({ n: count() }).from(sensors).where(eq(sensors.active, true)),
    db().select({ n: count() }).from(sensors).where(gt(sensors.lastSeenAt, online)),
    db().select({ n: count() }).from(feedback).where(gt(feedback.createdAt, day)),
    db().select({ n: count() }).from(alerts).where(ne(alerts.status, "resolved")),
    db().select().from(modelRuns).orderBy(desc(modelRuns.startedAt)).limit(1),
    mlHealth(),
  ]);
  const role = (r: string) => byRole.find((x) => x.role === r)?.n ?? 0;
  const open = openAlerts?.n ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "shield", text: "Setup" }}
        title="System overview"
        sub="Accounts, rooms, sensors and the comfort model at a glance."
      />
      <div className="stats">
        <Stat icon="shield" label="Admins" value={role("admin")} />
        <Stat icon="user-check" label="Facility managers" value={role("facility_manager")} />
        <Stat icon="users" label="Occupants" value={role("occupant")} />
        <Stat icon="home" label="Rooms" value={roomCount?.n ?? 0} />
        <Stat icon="cpu" label="Sensors online" value={sensorsOnline?.n ?? 0} unit={`/ ${sensorCount?.n ?? 0}`} hint="Seen in the last 10 min" />
        <Stat icon="message-square" label="Votes, last 24 h" value={votes24h?.n ?? 0} />
        <Stat icon="bell" label="Open alerts" value={open} tone={open ? "danger" : undefined} />
      </div>
      <div className="grid grid-2">
        <section className="panel">
          <PanelHead icon="trending-up" title="Comfort model">
            {ml.ok ? (
              <Badge tone="ok" dot>Service up</Badge>
            ) : (
              <Badge tone="danger" dot>Unreachable</Badge>
            )}
          </PanelHead>
          <dl className="kv">
            <dt>Serving</dt>
            <dd>{ml.ok ? <code>{ml.model}</code> : "—"}</dd>
            <dt>Last run</dt>
            <dd>{lastRun ? `${lastRun.status}, ${formatDateTime(lastRun.startedAt)}` : "Never"}</dd>
            <dt>Votes used</dt>
            <dd>{lastRun?.trainingRows ?? 0}</dd>
          </dl>
          <Link href="/admin/model" className="btn btn-ghost btn-sm mt">
            Open model page
            <Icon name="chevron-right" size={14} />
          </Link>
        </section>
        <section className="panel">
          <PanelHead icon="check-circle" title="Getting started" />
          <ol className="steps">
            <li>
              <span>
                <Link href="/admin/rooms">Add a building and its rooms</Link>. Each room code goes into a QR code on the door.
              </span>
            </li>
            <li>
              <span>Register each ESP32 under the room it sits in and flash the device key onto it.</span>
            </li>
            <li>
              <span>
                <Link href="/admin/users">Create facility manager accounts</Link>.
              </span>
            </li>
            <li>
              <span>
                <Link href="/admin/pics">Set a person in charge</Link> per room to get alert emails.
              </span>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
