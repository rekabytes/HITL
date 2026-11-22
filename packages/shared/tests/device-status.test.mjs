import assert from "node:assert/strict";
import test from "node:test";
import { co2Status, deviceStatus } from "../src/device-status.ts";

const now = Date.parse("2026-11-22T12:00:00Z");
const recent = new Date(now - 60_000);
const expired = new Date(now - 180_000);
const base = { active: true, lastSeenAt: recent, lastHeartbeatAt: recent, sensorResponding: true };
const cases = [
  ["confirmed real read", {}, "online", "online"],
  ["failed sensor read despite a recent heartbeat", { sensorResponding: false }, "online", "offline"],
  ["missing heartbeat at cutoff", { lastHeartbeatAt: expired }, "offline", "unknown"],
  ["legacy reading does not prove hardware health", { lastHeartbeatAt: null, sensorResponding: null }, "online", "unknown"],
  ["never reported", { lastHeartbeatAt: null, lastSeenAt: null }, "never_reported", "unknown"],
  ["disabled", { active: false }, "inactive", "inactive"],
];
for (const [name, overrides, esp32, sensor] of cases) {
  test(name, () => assert.deepEqual(deviceStatus({ ...base, ...overrides }, now), { esp32, sensor }));
}

for (const [name, overrides, status] of [
  ["missing CO2 reports", { co2State: null }, "not_installed"],
  ["CO2 works even when the BME280 fails", { sensorResponding: false }, "online"],
  ["CO2 warm-up", { co2State: "warming_up" }, "warming_up"],
  ["CO2 failure", { co2State: "offline" }, "offline"],
  ["CO2 unknown when heartbeat expires", { lastHeartbeatAt: expired }, "unknown"],
  ["CO2 status for a disabled board", { active: false }, "inactive"],
]) {
  test(name, () => assert.equal(co2Status({ ...base, co2State: "online", ...overrides }, now), status));
}
