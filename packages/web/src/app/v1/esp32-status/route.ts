import { ESP32_ONLINE_MIN } from "@hitl/shared";
import { json } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicSensorStatuses } from "@/lib/public-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await rateLimit(`public-v1-esp32:${clientIp(req.headers)}`, 60, 60))) {
    return json({ error: "Too many requests, slow down" }, 429);
  }

  const requestedId = new URL(req.url).searchParams.get("deviceId")?.trim() || undefined;
  if (requestedId && (requestedId.length > 128 || /[^a-zA-Z0-9._:-]/.test(requestedId))) {
    return json({ error: "Invalid deviceId" }, 400);
  }

  try {
    const sensors = await publicSensorStatuses(requestedId);
    if (requestedId && sensors.length === 0) return json({ error: "Device not found" }, 404);
    const devices = sensors.map((sensor) => ({
      deviceId: sensor.deviceId,
      label: sensor.label,
      firmwareVersion: sensor.firmwareVersion,
      active: sensor.active,
      status: sensor.esp32.status,
      lastSeenAt: sensor.esp32.lastSeenAt,
      lastHeartbeatAt: sensor.esp32.lastHeartbeatAt,
      rooms: sensor.rooms,
    }));
    return json({
      status: "ok",
      timestamp: new Date().toISOString(),
      thresholds: { onlineMinutes: ESP32_ONLINE_MIN },
      summary: {
        total: devices.length,
        online: devices.filter((device) => device.status === "online").length,
        offline: devices.filter((device) => device.status === "offline").length,
        inactive: devices.filter((device) => device.status === "inactive").length,
        neverReported: devices.filter((device) => device.status === "never_reported").length,
      },
      devices,
    });
  } catch {
    return json({ error: "Unable to read ESP32 status" }, 503);
  }
}
