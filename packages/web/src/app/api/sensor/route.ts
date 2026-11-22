import { sensorReportInput } from "@hitl/shared";
import { secretHash } from "@/lib/auth";
import { json, problem, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ingestSensorReport, sensorByKeyHash } from "@/lib/readings";

export const dynamic = "force-dynamic";

/**
 * ESP32 endpoint. Send the device key from /admin/rooms in `X-Device-Key`
 * (or `Authorization: Bearer <key>`) and a sensor check or legacy reading.
 * The key decides which rooms the reading belongs to.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const key = req.headers.get("x-device-key")?.trim() || (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "");
  if (!key) return problem(401, "Missing device key");

  const sensor = await sensorByKeyHash(secretHash(key));
  if (!sensor) return problem(401, "Unknown or inactive device key");
  if (!(await rateLimit(`sensor:${sensor.id}`, 120, 60))) return problem(429, "Too many readings, slow down");

  const body = await readJson(req, sensorReportInput);
  if (!body.ok) return body.response;

  const report = body.data;
  // The CO2 check is independent of the BME280: record it whatever the BME280 did.
  const co2 = "sensorStatus" in report ? report.co2 : undefined;
  const co2Reply = co2 ? { co2Status: co2.status } : {};
  const { roomIds } = await ingestSensorReport(sensor, report);
  if ("sensorStatus" in report && report.sensorStatus === "offline") {
    return json({ status: "heartbeat", sensorStatus: "offline", ...co2Reply });
  }
  return json({ status: "stored", roomIds, assigned: roomIds.length > 0, ...co2Reply });
}
