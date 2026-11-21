import { sensorReadingInput } from "@hitl/shared";
import { secretHash } from "@/lib/auth";
import { json, problem, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { ingestReading, sensorByKeyHash } from "@/lib/readings";

export const dynamic = "force-dynamic";

/**
 * ESP32 endpoint. Send the device key from /admin/rooms in `X-Device-Key`
 * (or `Authorization: Bearer <key>`) and a JSON body:
 *   {"temperature": 27.4, "humidity": 66.1, "pressure": 1008.2}
 * The key decides which room the reading belongs to.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const key = req.headers.get("x-device-key")?.trim() || (auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "");
  if (!key) return problem(401, "Missing device key");

  const sensor = await sensorByKeyHash(secretHash(key));
  if (!sensor) return problem(401, "Unknown or inactive device key");
  if (!(await rateLimit(`sensor:${sensor.id}`, 120, 60))) return problem(429, "Too many readings, slow down");

  const body = await readJson(req, sensorReadingInput);
  if (!body.ok) return body.response;

  const { roomId } = await ingestReading(sensor, body.data);
  return json({ status: "stored", roomId, assigned: roomId !== null });
}
