import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { rooms, sensorReadings, sensorRooms, sensors } from "@hitl/db";
import { PageHeader } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/time";

export const metadata: Metadata = { title: "Sensors" };

const ONLINE_MIN = 10;

export default async function SensorsPage() {
  const user = await requireStaff();
  const [sensorRows, links] = await Promise.all([
    db().select().from(sensors).orderBy(asc(sensors.deviceId)),
    db()
      .select({ sensorId: sensorRooms.sensorId, code: rooms.code })
      .from(sensorRooms)
      .innerJoin(rooms, eq(rooms.id, sensorRooms.roomId))
      .orderBy(asc(rooms.code)),
  ]);
  const latest = await Promise.all(
    sensorRows.map(async (s) => {
      const [r] = await db()
        .select()
        .from(sensorReadings)
        .where(eq(sensorReadings.sensorId, s.id))
        .orderBy(desc(sensorReadings.recordedAt))
        .limit(1);
      return r ?? null;
    }),
  );
  const cutoff = Date.now() - ONLINE_MIN * 60_000;

  return (
    <>
      <PageHeader
        title="Sensors"
        sub={`ESP32 and BME280 units. Online means a reading in the last ${ONLINE_MIN} minutes.${
          user.role === "admin" ? " Register and assign them under Rooms and sensors." : ""
        }`}
      />
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Rooms</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Last reading</th>
              </tr>
            </thead>
            <tbody>
              {sensorRows.length === 0 && (
                <tr><td colSpan={5} className="empty">No sensors registered.</td></tr>
              )}
              {sensorRows.map((s, i) => {
                const online = !!s.lastSeenAt && s.lastSeenAt.getTime() > cutoff;
                const codes = links.filter((l) => l.sensorId === s.id).map((l) => l.code);
                const l = latest[i];
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.deviceId}</strong>
                      {(s.label || s.firmwareVersion) && (
                        <div className="small muted">
                          {[s.label, s.firmwareVersion && `firmware ${s.firmwareVersion}`].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>{codes.length ? codes.join(", ") : <span className="muted">not assigned</span>}</td>
                    <td>
                      {!s.active ? (
                        <span className="badge">turned off</span>
                      ) : online ? (
                        <span className="badge badge-ok">online</span>
                      ) : (
                        <span className="badge badge-danger">offline</span>
                      )}
                    </td>
                    <td className="small" title={formatDateTime(s.lastSeenAt)}>{timeAgo(s.lastSeenAt)}</td>
                    <td className="small">
                      {l
                        ? `${l.temperatureC.toFixed(1)} °C, ${l.humidityPct.toFixed(0)}% RH${l.pressureHpa ? `, ${l.pressureHpa.toFixed(0)} hPa` : ""}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
