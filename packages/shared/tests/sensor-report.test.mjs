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

test("SHT3x reading with unavailable pressure is accepted", () => {
  assert.equal(sensorReportInput.safeParse({
    sensorStatus: "online",
    firmwareVersion: "hitl-1.4.0",
    reading: { temperature: 25.5, humidity: 59.8, pressure: null },
    co2: { status: "online", ppm: 413 },
  }).success, true);
});

test("versioned readings still validate numeric BME280 pressure", () => {
  const report = { sensorStatus: "online", firmwareVersion: "hitl-1.3.0" };
  const reading = { temperature: 25.5, humidity: 59.8 };
  assert.equal(sensorReportInput.safeParse({ ...report, reading: { ...reading, pressure: 1013.2 } }).success, true);
  assert.equal(sensorReportInput.safeParse({ ...report, reading: { ...reading, pressure: 0 } }).success, false);
});

test("legacy BME280 payload remains accepted", () => {
  assert.equal(sensorReportInput.safeParse({ temperature: 25, humidity: 57 }).success, true);
});
