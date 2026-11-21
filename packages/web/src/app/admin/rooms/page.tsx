import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { buildings, sensorRooms, sensors } from "@hitl/db";
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
  deleteBuildingAction,
  deleteRoomAction,
  deleteSensorAction,
  rotateSensorKeyAction,
  updateRoomAction,
  updateSensorAction,
} from "./actions";

export const metadata: Metadata = { title: "Rooms and sensors" };

export default async function RoomsPage() {
  await requireAdmin();
  const [buildingRows, roomRows, sensorRows, links] = await Promise.all([
    db().select().from(buildings).orderBy(asc(buildings.name)),
    listRooms(),
    db().select().from(sensors).orderBy(asc(sensors.deviceId)),
    db().select().from(sensorRooms),
  ]);
  const roomsOf = (sensorId: string) => links.filter((l) => l.sensorId === sensorId).map((l) => l.roomId);
  const sensorsIn = (roomId: string) => links.filter((l) => l.roomId === roomId).length;
  const roomCount = (buildingId: string) => roomRows.filter((r) => r.buildingId === buildingId).length;
  const roomOptions = roomRows.map((r) => (
    <option key={r.id} value={r.id}>
      {r.code} · {r.name}
    </option>
  ));
  const multiSize = Math.min(Math.max(roomRows.length, 2), 6);

  return (
    <>
      <PageHeader title="Rooms and sensors" sub="Room codes go into the QR codes occupants scan. A sensor can report for one room or several." />

      <div className="grid grid-2">
        <section className="panel">
          <h2>Buildings</h2>
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
            <table style={{ marginTop: "0.75rem" }}>
              <tbody>
                {buildingRows.map((b) => (
                  <tr key={b.id}>
                    <td><strong>{b.name}</strong>{b.address && <div className="small muted">{b.address}</div>}</td>
                    <td className="num small">{roomCount(b.id)} rooms</td>
                    <td>
                      {roomCount(b.id) === 0 && (
                        <ActionForm action={deleteBuildingAction} submitLabel="Delete" variant="ghost" className="form-inline">
                          <input type="hidden" name="id" value={b.id} />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {roomRows.length === 0 && (
                <tr><td colSpan={6} className="empty">No rooms yet.</td></tr>
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
                  <td>
                    <details>
                      <summary className="small">Delete…</summary>
                      <p className="small muted" style={{ maxWidth: 260 }}>
                        Deletes the room with all its readings, votes, alerts, actions and its person in charge. Type{" "}
                        <strong>{r.code}</strong> to confirm.
                      </p>
                      <ActionForm action={deleteRoomAction} submitLabel="Delete room" variant="danger" className="form-inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="confirm" required placeholder={r.code} aria-label={`Type ${r.code} to confirm`} style={{ width: 110 }} autoComplete="off" />
                      </ActionForm>
                    </details>
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
          Hold Ctrl (Cmd on a Mac) to pick more than one room.
        </p>
        <ActionForm action={createSensorAction} submitLabel="Register sensor">
          <div className="form-row">
            <label>
              Device id
              <input name="deviceId" required placeholder="esp32-bk01-a" />
            </label>
            <label>
              Firmware version
              <input name="firmwareVersion" placeholder="v2.4.11" maxLength={64} />
            </label>
            <label>
              Label
              <input name="label" placeholder="BME280 near the door" />
            </label>
            <label>
              Rooms
              <select name="roomIds" multiple size={multiSize}>
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
                <th>Details, rooms and status</th>
                <th>Key</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {sensorRows.length === 0 && (
                <tr><td colSpan={5} className="empty">No sensors registered.</td></tr>
              )}
              {sensorRows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.deviceId}</strong>
                    {s.firmwareVersion && <div className="small muted">firmware {s.firmwareVersion}</div>}
                  </td>
                  <td className="small">{timeAgo(s.lastSeenAt)}</td>
                  <td>
                    <ActionForm action={updateSensorAction} submitLabel="Save" variant="ghost" className="form-inline">
                      <input type="hidden" name="id" value={s.id} />
                      <input name="label" defaultValue={s.label ?? ""} placeholder="label" aria-label="Label" style={{ width: 140 }} />
                      <input name="firmwareVersion" defaultValue={s.firmwareVersion ?? ""} placeholder="firmware" aria-label="Firmware version" style={{ width: 100 }} maxLength={64} />
                      <select name="roomIds" multiple size={multiSize} defaultValue={roomsOf(s.id)} aria-label="Rooms">
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
                  <td>
                    <details>
                      <summary className="small">Delete…</summary>
                      <p className="small muted" style={{ maxWidth: 220 }}>Past readings stay in their rooms.</p>
                      <ActionForm action={deleteSensorAction} submitLabel="Delete sensor" variant="danger" className="form-inline">
                        <input type="hidden" name="id" value={s.id} />
                      </ActionForm>
                    </details>
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
