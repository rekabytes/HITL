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
