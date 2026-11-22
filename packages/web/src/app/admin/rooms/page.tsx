import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { buildings, sensorRooms, sensors } from "@hitl/db";
import { ActionForm } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { Badge, Empty, EmptyRow, PageHeader, PanelHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms } from "@/lib/readings";
import { DeviceStatusCell, LiveDeviceStatus } from "@/components/LiveDeviceStatus";
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
  const multiSize = Math.min(Math.max(roomRows.length, 2), 5);

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "shield", text: "Setup" }}
        title="Rooms and sensors"
        sub="Each room's QR code opens its vote screen at APP_URL/r/CODE, so occupants can scan it with any phone camera. A sensor can report for one room or several."
      />

      <div className="grid grid-2">
        <section className="panel">
          <PanelHead icon="layers" title="Buildings" count={buildingRows.length} />
          <ActionForm action={createBuildingAction} submitLabel="Add building" icon="plus">
            <div className="form-row">
              <label>
                Name
                <input name="name" required placeholder="URSB Building" />
              </label>
              <label>
                Address
                <input name="address" placeholder="Optional" />
              </label>
            </div>
          </ActionForm>
          {buildingRows.length > 0 && (
            <table className="plain-table mt">
              <tbody>
                {buildingRows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="cell-title">{b.name}</div>
                      {b.address && <div className="cell-sub">{b.address}</div>}
                    </td>
                    <td className="small muted nowrap">
                      {roomCount(b.id)} {roomCount(b.id) === 1 ? "room" : "rooms"}
                    </td>
                    <td style={{ width: 1 }}>
                      {roomCount(b.id) === 0 && (
                        <ActionForm action={deleteBuildingAction} submitLabel="Delete" icon="trash-2" variant="ghost" size="sm" className="form-inline">
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
          <PanelHead icon="plus" title="Add a room" />
          {buildingRows.length === 0 ? (
            <Empty icon="layers">Add a building first.</Empty>
          ) : (
            <ActionForm action={createRoomAction} submitLabel="Add room" icon="plus">
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
                  Code (in the QR link)
                  <input name="code" required placeholder="L21" pattern="[A-Za-z0-9_\-]+" />
                </label>
                <label>
                  Name
                  <input name="name" required placeholder="Level 21" />
                </label>
                <label>
                  Floor
                  <input name="floor" placeholder="Optional" />
                </label>
              </div>
            </ActionForm>
          )}
        </section>
      </div>

      <section className="panel panel-flush mt">
        <PanelHead icon="home" title="Rooms" count={roomRows.length} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Name and floor</th>
                <th>Sensors</th>
                <th>QR code</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roomRows.length === 0 && <EmptyRow colSpan={5} icon="home">No rooms yet.</EmptyRow>}
              {roomRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-title">{r.code}</div>
                    <div className="cell-sub">{r.buildingName}</div>
                  </td>
                  <td>
                    <ActionForm action={updateRoomAction} submitLabel="Save" icon="save" variant="ghost" size="sm" className="form-inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="name" defaultValue={r.name} required aria-label="Room name" className="input-sm" />
                      <input name="floor" defaultValue={r.floor ?? ""} placeholder="Floor" aria-label="Floor" className="input-sm" style={{ width: 80 }} />
                    </ActionForm>
                  </td>
                  <td>
                    <Badge icon="cpu">{sensorsIn(r.id)}</Badge>
                  </td>
                  <td>
                    <a className="btn btn-ghost btn-sm" href={`/admin/rooms/${r.id}/qr`} target="_blank" rel="noreferrer">
                      <Icon name="external-link" size={14} />
                      Open
                    </a>
                  </td>
                  <td style={{ width: 1 }}>
                    <details className="danger-zone">
                      <summary>
                        <Icon name="trash-2" size={14} />
                        Delete
                      </summary>
                      <div className="dz-body">
                        <p className="small muted">
                          Removes the room with all its readings, votes, alerts, actions and its person in charge. Type <strong>{r.code}</strong> to confirm.
                        </p>
                        <ActionForm action={deleteRoomAction} submitLabel="Delete room" icon="trash-2" variant="danger" size="sm" className="form-inline">
                          <input type="hidden" name="id" value={r.id} />
                          <input name="confirm" required placeholder={r.code} aria-label={`Type ${r.code} to confirm`} className="input-sm" style={{ width: 110 }} autoComplete="off" />
                        </ActionForm>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mt">
        <PanelHead icon="cpu" title="Register a sensor" />
        <p className="small muted" style={{ marginBottom: "1rem" }}>
          The device key is shown once. The ESP32 sends it in the <code>X-Device-Key</code> header to <code>/api/sensor</code>.
          Hold Ctrl (Cmd on a Mac) to pick more than one room.
        </p>
        <ActionForm action={createSensorAction} submitLabel="Register sensor" icon="plus">
          <div className="form-row">
            <label>
              Device id
              <input name="deviceId" required placeholder="esp32-l21-a" />
            </label>
            <label>
              Firmware version
              <input name="firmwareVersion" placeholder="v2.4.11" maxLength={64} />
            </label>
            <label>
              Label
              <input name="label" placeholder="SHT3x near the door" />
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

      <section className="panel panel-flush mt">
        <PanelHead icon="cpu" title="Sensors" count={sensorRows.length} />
        <div className="table-wrap">
          <LiveDeviceStatus>
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Details and rooms</th>
                <th>Key</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sensorRows.length === 0 && <EmptyRow colSpan={5} icon="cpu">No sensors registered.</EmptyRow>}
              {sensorRows.map((s) => {
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-title">{s.deviceId}</div>
                      <div className="cell-sub">{s.firmwareVersion ? `Firmware ${s.firmwareVersion}` : "No firmware set"}</div>
                    </td>
                    <td><DeviceStatusCell deviceId={s.deviceId} /></td>
                    <td>
                      <ActionForm action={updateSensorAction} submitLabel="Save" icon="save" variant="ghost" size="sm" className="form-inline">
                        <input type="hidden" name="id" value={s.id} />
                        <input name="label" defaultValue={s.label ?? ""} placeholder="Label" aria-label="Label" className="input-sm" style={{ width: 120 }} />
                        <input name="firmwareVersion" defaultValue={s.firmwareVersion ?? ""} placeholder="Firmware" aria-label="Firmware version" className="input-sm" style={{ width: 90 }} maxLength={64} />
                        <select name="roomIds" multiple size={Math.min(multiSize, 3)} defaultValue={roomsOf(s.id)} aria-label="Rooms" style={{ minWidth: 180 }}>
                          {roomOptions}
                        </select>
                        <label className="check">
                          <input type="checkbox" name="active" defaultChecked={s.active} /> Active
                        </label>
                      </ActionForm>
                    </td>
                    <td>
                      <ActionForm action={rotateSensorKeyAction} submitLabel="New key" icon="key" variant="ghost" size="sm" className="form-inline">
                        <input type="hidden" name="id" value={s.id} />
                      </ActionForm>
                    </td>
                    <td style={{ width: 1 }}>
                      <details className="danger-zone">
                        <summary>
                          <Icon name="trash-2" size={14} />
                          Delete
                        </summary>
                        <div className="dz-body">
                          <p className="small muted">Past readings stay in their rooms.</p>
                          <ActionForm action={deleteSensorAction} submitLabel="Delete sensor" icon="trash-2" variant="danger" size="sm" className="form-inline">
                            <input type="hidden" name="id" value={s.id} />
                          </ActionForm>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </LiveDeviceStatus>
        </div>
      </section>
    </>
  );
}
