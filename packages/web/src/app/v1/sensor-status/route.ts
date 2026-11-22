import { ESP32_ONLINE_MIN } from "@hitl/shared";
import { json } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicSensorStatuses } from "@/lib/public-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await rateLimit(`public-v1-sensor:${clientIp(req.headers)}`, 60, 60))) {
    return json({ error: "Too many requests, slow down" }, 429);
  }

  const requestedId = new URL(req.url).searchParams.get("deviceId")?.trim() || undefined;
  if (requestedId && (requestedId.length > 128 || /[^a-zA-Z0-9._:-]/.test(requestedId))) {
    return json({ error: "Invalid deviceId" }, 400);
  }

  try {
    const sensors = await publicSensorStatuses(requestedId);
    if (requestedId && sensors.length === 0) return json({ error: "Device not found" }, 404);
    return json({
      status: "ok",
      timestamp: new Date().toISOString(),
      thresholds: { onlineMinutes: ESP32_ONLINE_MIN },
      summary: {
        total: sensors.length,
        online: sensors.filter((sensor) => sensor.sensor.status === "online").length,
        offline: sensors.filter((sensor) => sensor.sensor.status === "offline").length,
        inactive: sensors.filter((sensor) => sensor.sensor.status === "inactive").length,
        unknown: sensors.filter((sensor) => sensor.sensor.status === "unknown").length,
      },
      sensors: sensors.map((sensor) => ({
        deviceId: sensor.deviceId,
        label: sensor.label,
        firmwareVersion: sensor.firmwareVersion,
        status: sensor.sensor.status,
        active: sensor.active,
        lastReadingAt: sensor.sensor.lastReadingAt,
        temperatureC: sensor.sensor.temperatureC,
        humidityPct: sensor.sensor.humidityPct,
        pressureHpa: sensor.sensor.pressureHpa,
        co2: sensor.co2,
        rooms: sensor.rooms,
      })),
    });
  } catch {
    return json({ error: "Unable to read sensor status" }, 503);
  }
}
