import type { Co2State } from "./schemas";

export const ESP32_ONLINE_MIN = 3;

type DeviceContact = {
  active: boolean;
  lastSeenAt: Date | null;
  lastHeartbeatAt: Date | null;
  sensorResponding: boolean | null;
};

export function deviceStatus(device: DeviceContact, now = Date.now()) {
  if (!device.active) return { esp32: "inactive", sensor: "inactive" } as const;
  const contact = device.lastHeartbeatAt ?? device.lastSeenAt;
  if (!contact) return { esp32: "never_reported", sensor: "unknown" } as const;
  if (now - contact.getTime() >= ESP32_ONLINE_MIN * 60_000) {
    return { esp32: "offline", sensor: "unknown" } as const;
  }
  const responding = device.lastHeartbeatAt ? device.sensorResponding : null;
  return { esp32: "online", sensor: responding === null ? "unknown" : responding ? "online" : "offline" } as const;
}

export type Co2Status = Co2State | "unknown" | "not_installed" | "inactive";

/**
 * CO2 sensor status, judged the same way as the BME280 but on its own:
 * - "not_installed": no CO2 check or prior reading (may be running old firmware).
 * - "unknown": the board itself stopped reporting, so nothing is known about its CO2 sensor.
 * - otherwise the last state the board reported: online, warming_up or offline.
 */
export function co2Status(device: DeviceContact & { co2State: Co2State | null; lastCo2ReadingAt?: Date | null }, now = Date.now()): Co2Status {
  if (!device.active) return "inactive";
  if (device.co2State === null) return device.lastCo2ReadingAt ? "unknown" : "not_installed";
  if (deviceStatus(device, now).esp32 !== "online") return "unknown";
  return device.co2State;
}
