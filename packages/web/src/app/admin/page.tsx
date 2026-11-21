import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, gt, ne } from "drizzle-orm";
import { alerts, feedback, modelRuns, rooms, sensors, users } from "@hitl/db";
import { PageHeader } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { mlHealth } from "@/lib/ml";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Admin" };

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

  return (
    <>
      <PageHeader title="Admin overview" sub="Accounts, rooms, sensors and the comfort model." />
      <div className="stats">
        <Stat label="Admins" value={role("admin")} />
        <Stat label="Facility managers" value={role("facility_manager")} />
        <Stat label="Occupants" value={role("occupant")} />
        <Stat label="Rooms" value={roomCount?.n ?? 0} />
        <Stat label="Sensors online" value={`${sensorsOnline?.n ?? 0} / ${sensorCount?.n ?? 0}`} hint="seen in the last 10 min" />
        <Stat label="Votes, last 24 h" value={votes24h?.n ?? 0} />
        <Stat label="Open alerts" value={openAlerts?.n ?? 0} />
      </div>
      <div className="grid grid-2">
        <section className="panel">
          <h2>Comfort model</h2>
          <p className="small">
            Service: {ml.ok ? <span className="badge badge-ok">up</span> : <span className="badge badge-danger">unreachable</span>}{" "}
            {ml.ok && <>model <code>{ml.model}</code></>}
          </p>
          <p className="small muted">
            Last run: {lastRun ? `${lastRun.status}, ${formatDateTime(lastRun.startedAt)}, ${lastRun.trainingRows} votes` : "never"}
          </p>
          <Link href="/admin/model">Open model page</Link>
        </section>
        <section className="panel">
          <h2>Getting started</h2>
          <ol className="list small">
            <li><Link href="/admin/rooms">Add a building and its rooms</Link>. Each room code goes into a QR code on the door.</li>
            <li>Register each ESP32 under the room it sits in and flash the device key onto it.</li>
            <li><Link href="/admin/users">Create facility manager accounts</Link>.</li>
            <li><Link href="/admin/pics">Set a person in charge</Link> per room to get alert emails.</li>
          </ol>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
