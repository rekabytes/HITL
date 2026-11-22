import assert from "node:assert/strict";
import test from "node:test";
import { sensorReportInput } from "../src/schemas.ts";

const heartbeat = { sensorStatus: "offline", firmwareVersion: "hitl-1.3.0" };
for (const [co2, accepted] of [
  [undefined, true],
  [{ status: "online", ppm: 413 }, true],
  [{ status: "online", ppm: 0 }, false],
  [{ status: "online", ppm: 5010 }, false],
  [{ status: "online", ppm: 413.5 }, false],
  [{ status: "online" }, false],
  [{ status: "warming_up" }, true],
  [{ status: "warming_up", ppm: 413 }, false],
  [{ status: "offline" }, true],
  [{ status: "offline", ppm: 413 }, false],
]) {
  test("CO2 report " + JSON.stringify(co2) + (accepted ? " accepted" : " rejected"), () => {
    assert.equal(sensorReportInput.safeParse({ ...heartbeat, co2 }).success, accepted);
  });
}

test("legacy BME280 payload remains accepted", () => {
  assert.equal(sensorReportInput.safeParse({ temperature: 25, humidity: 57 }).success, true);
});
