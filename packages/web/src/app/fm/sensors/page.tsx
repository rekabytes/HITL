import type { Metadata } from "next";
import { DeviceStatusCell, LiveDeviceStatus } from "@/components/LiveDeviceStatus";
import { SensorStatusModal } from "@/components/SensorStatusModal";
import { Badge, EmptyRow, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { publicSensorStatuses } from "@/lib/public-status";

export const metadata: Metadata = { title: "Sensor status" };

export default async function SensorsPage() {
  await requireStaff();
  const devices = await publicSensorStatuses();
  return <>
    <PageHeader eyebrow={{ icon: "cpu", text: "Monitor" }} title="Sensor status"
      sub="ESP32 connectivity and environmental sensor checks (SHT3x or BME280) are tracked separately. Status refreshes automatically." />
    <section className="panel panel-flush">
      <div className="table-wrap">
        <LiveDeviceStatus>
          <table>
            <thead><tr><th>Device</th><th>Rooms</th><th>Status</th></tr></thead>
            <tbody>
              {devices.length === 0 && <EmptyRow colSpan={3} icon="cpu">No sensors registered.</EmptyRow>}
              {devices.map((device) => <tr key={device.deviceId}>
                <td><SensorStatusModal initial={device} /></td>
                <td>{device.rooms.length ? device.rooms.map((room) => <Badge key={room} icon="map-pin">{room}</Badge>) : "Not assigned"}</td>
                <td><DeviceStatusCell deviceId={device.deviceId} initial={device} /></td>
              </tr>)}
            </tbody>
          </table>
        </LiveDeviceStatus>
      </div>
    </section>
  </>;
}
