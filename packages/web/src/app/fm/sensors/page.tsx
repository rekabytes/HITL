import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { rooms, sensors } from "@hitl/db";
import { PageHeader } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { latestReading } from "@/lib/readings";
import { formatDateTime, timeAgo } from "@/lib/time";

export const metadata: Metadata = { title: "Sensors" };

const ONLINE_MIN = 10;

export default async function SensorsPage() {
  const user = await requireStaff();
  const rows = await db()
    .select({ sensor: sensors, code: rooms.code, roomName: rooms.name })
    .from(sensors)
    .leftJoin(rooms, eq(rooms.id, sensors.roomId))
    .orderBy(asc(rooms.code), asc(sensors.deviceId));
  const latest = await Promise.all(rows.map((r) => (r.sensor.roomId ? latestReading(r.sensor.roomId) : null)));
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
                <th>Room</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Room's latest reading</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="empty">No sensors registered.</td></tr>
              )}
              {rows.map(({ sensor: s, code, roomName }, i) => {
                const online = !!s.lastSeenAt && s.lastSeenAt.getTime() > cutoff;
                const l = latest[i];
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.deviceId}</strong>
                      {s.label && <div className="small muted">{s.label}</div>}
                    </td>
                    <td>{code ? `${code} · ${roomName}` : <span className="muted">not assigned</span>}</td>
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
                      {l ? `${l.temperatureC.toFixed(1)} °C, ${l.humidityPct.toFixed(0)}% RH${l.pressureHpa ? `, ${l.pressureHpa.toFixed(0)} hPa` : ""}` : "—"}
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
