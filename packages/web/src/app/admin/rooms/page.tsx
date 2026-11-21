import type { Metadata } from "next";
import { asc, count, eq } from "drizzle-orm";
import { buildings, sensors } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/Shell";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms } from "@/lib/readings";
import { timeAgo } from "@/lib/time";
import {
  createBuildingAction,
  createRoomAction,
  createSensorAction,
  rotateSensorKeyAction,
  updateRoomAction,
  updateSensorAction,
} from "./actions";

export const metadata: Metadata = { title: "Rooms and sensors" };

export default async function RoomsPage() {
  await requireAdmin();
  const [buildingRows, roomRows, sensorRows, sensorCounts] = await Promise.all([
    db().select().from(buildings).orderBy(asc(buildings.name)),
    listRooms(),
    db().select().from(sensors).orderBy(asc(sensors.deviceId)),
    db().select({ roomId: sensors.roomId, n: count() }).from(sensors).where(eq(sensors.active, true)).groupBy(sensors.roomId),
  ]);
  const sensorsIn = (roomId: string) => sensorCounts.find((c) => c.roomId === roomId)?.n ?? 0;
  const roomOptions = roomRows.map((r) => (
    <option key={r.id} value={r.id}>
      {r.code} · {r.name}
    </option>
  ));

  return (
    <>
      <PageHeader title="Rooms and sensors" sub="Room codes go into the QR codes occupants scan. Each sensor belongs to one room." />

      <div className="grid grid-2">
        <section className="panel">
          <h2>Add a building</h2>
          <ActionForm action={createBuildingAction} submitLabel="Add building">
            <div className="form-row">
              <label>
                Name
                <input name="name" required placeholder="Block K" />
              </label>
              <label>
                Address
                <input name="address" />
              </label>
            </div>
          </ActionForm>
          {buildingRows.length > 0 && (
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              {buildingRows.map((b) => b.name).join(", ")}
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Add a room</h2>
          {buildingRows.length === 0 ? (
            <p className="muted">Add a building first.</p>
          ) : (
            <ActionForm action={createRoomAction} submitLabel="Add room">
              <div className="form-row">
                <label>
                  Building
                  <select name="buildingId" required>
                    {buildingRows.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Code (in the QR)
                  <input name="code" required placeholder="BK-01" pattern="[A-Za-z0-9_\-]+" />
                </label>
                <label>
                  Name
                  <input name="name" required placeholder="Lecture room 1" />
                </label>
                <label>
                  Floor
                  <input name="floor" />
                </label>
              </div>
            </ActionForm>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Rooms ({roomRows.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Building</th>
                <th>Name and floor</th>
                <th>Sensors</th>
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {roomRows.length === 0 && (
                <tr><td colSpan={5} className="empty">No rooms yet.</td></tr>
              )}
              {roomRows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.code}</strong></td>
                  <td>{r.buildingName}</td>
                  <td>
                    <ActionForm action={updateRoomAction} submitLabel="Save" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="name" defaultValue={r.name} required aria-label="Room name" />
                      <input name="floor" defaultValue={r.floor ?? ""} placeholder="floor" aria-label="Floor" style={{ width: 90 }} />
                    </ActionForm>
                  </td>
                  <td className="num">{sensorsIn(r.id)}</td>
                  <td>
                    <a href={`/admin/rooms/${r.id}/qr`} target="_blank" rel="noreferrer">QR code</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Register a sensor</h2>
        <p className="small muted">
          The device key is shown once. The ESP32 sends it in the <code>X-Device-Key</code> header to <code>/api/sensor</code>.
        </p>
        <ActionForm action={createSensorAction} submitLabel="Register sensor">
          <div className="form-row">
            <label>
              Device id
              <input name="deviceId" required placeholder="esp32-bk01-a" />
            </label>
            <label>
              Label
              <input name="label" placeholder="BME280 near the door" />
            </label>
            <label>
              Room
              <select name="roomId" defaultValue="">
                <option value="">Not assigned yet</option>
                {roomOptions}
              </select>
            </label>
          </div>
        </ActionForm>
      </section>

      <section className="panel">
        <h2>Sensors ({sensorRows.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Last seen</th>
                <th>Room and status</th>
                <th>Key</th>
              </tr>
            </thead>
            <tbody>
              {sensorRows.length === 0 && (
                <tr><td colSpan={4} className="empty">No sensors registered.</td></tr>
              )}
              {sensorRows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.deviceId}</strong>
                    {s.label && <div className="small muted">{s.label}</div>}
                  </td>
                  <td className="small">{timeAgo(s.lastSeenAt)}</td>
                  <td>
                    <ActionForm action={updateSensorAction} submitLabel="Save" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={s.id} />
                      <select name="roomId" defaultValue={s.roomId ?? ""} aria-label="Room">
                        <option value="">Not assigned</option>
                        {roomOptions}
                      </select>
                      <label className="form-inline" style={{ fontWeight: 400 }}>
                        <input type="checkbox" name="active" defaultChecked={s.active} /> active
                      </label>
                    </ActionForm>
                  </td>
                  <td>
                    <ActionForm action={rotateSensorKeyAction} submitLabel="New key" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={s.id} />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
