import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { rooms, sensorReadings, sensorRooms, sensors } from "@hitl/db";
import { Icon } from "@/components/Icon";
import { Badge, EmptyRow, PageHeader } from "@/components/ui";
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

  const onlineCount = sensorRows.filter((s) => s.active && s.lastSeenAt && s.lastSeenAt.getTime() > cutoff).length;

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "cpu", text: "Facility management" }}
        title="Sensors"
        sub={`ESP32 and BME280 units. Online means a reading in the last ${ONLINE_MIN} minutes.${
          user.role === "admin" ? " Register and assign them under Rooms and sensors." : ""
        }`}
      >
        <Badge tone={onlineCount === sensorRows.length ? "ok" : "warn"} icon="wifi">
          {onlineCount} of {sensorRows.length} online
        </Badge>
      </PageHeader>
      <section className="panel panel-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Rooms</th>
                <th>Status</th>
                <th>Last reading</th>
              </tr>
            </thead>
            <tbody>
              {sensorRows.length === 0 && <EmptyRow colSpan={4} icon="cpu">No sensors registered.</EmptyRow>}
              {sensorRows.map((s, i) => {
                const online = !!s.lastSeenAt && s.lastSeenAt.getTime() > cutoff;
                const codes = links.filter((l) => l.sensorId === s.id).map((l) => l.code);
                const l = latest[i];
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                        <span className="stat-icon" style={{ width: 34, height: 34 }}>
                          <Icon name="cpu" size={16} />
                        </span>
                        <div>
                          <div className="cell-title">{s.deviceId}</div>
                          <div className="cell-sub">
                            {[s.label, s.firmwareVersion && `firmware ${s.firmwareVersion}`].filter(Boolean).join(" · ") || "No details"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {codes.length ? (
                        <div className="votes">
                          {codes.map((c) => (
                            <Badge key={c} icon="map-pin">{c}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="faint small">Not assigned</span>
                      )}
                    </td>
                    <td>
                      {!s.active ? (
                        <Badge dot>Off</Badge>
                      ) : online ? (
                        <Badge tone="ok" dot>Online</Badge>
                      ) : (
                        <Badge tone="danger" dot>Offline</Badge>
                      )}
                      <div className="cell-sub" title={formatDateTime(s.lastSeenAt)}>{timeAgo(s.lastSeenAt)}</div>
                    </td>
                    <td className="small">
                      {l ? (
                        <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
                          <span className="nowrap"><Icon name="thermometer" size={13} className="faint" /> {l.temperatureC.toFixed(1)} °C</span>
                          <span className="nowrap"><Icon name="droplet" size={13} className="faint" /> {l.humidityPct.toFixed(0)}%</span>
                          {l.pressureHpa && <span className="nowrap"><Icon name="wind" size={13} className="faint" /> {l.pressureHpa.toFixed(0)} hPa</span>}
                        </div>
                      ) : (
                        <span className="faint">—</span>
                      )}
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
