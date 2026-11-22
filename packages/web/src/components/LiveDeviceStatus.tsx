"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicSensorStatus } from "@/lib/public-status";
import { Badge } from "./ui";

type Snapshot = Record<string, PublicSensorStatus> | null;
const LiveStatus = createContext<Snapshot | undefined>(undefined);

export function LiveDeviceStatus({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<Snapshot>();
  useEffect(() => {
    const controller = new AbortController();
    let next: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/staff/device-status", {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error("Status unavailable");
        const rows: PublicSensorStatus[] = await response.json();
        if (!controller.signal.aborted) setDevices(Object.fromEntries(rows.map((row) => [row.deviceId, row])));
      } catch {
        if (!controller.signal.aborted) setDevices(null);
      } finally {
        if (!controller.signal.aborted) next = setTimeout(refresh, 15_000);
      }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(next); };
  }, []);
  return <LiveStatus.Provider value={devices}>{children}</LiveStatus.Provider>;
}

export function useDeviceStatus(deviceId: string, initial?: PublicSensorStatus) {
  const snapshot = useContext(LiveStatus);
  return snapshot === undefined ? initial : snapshot && Object.hasOwn(snapshot, deviceId) ? snapshot[deviceId] : null;
}

export function DeviceBadge({ status }: { status?: PublicSensorStatus["esp32"]["status"] | PublicSensorStatus["sensor"]["status"] | PublicSensorStatus["co2"]["status"] }) {
  if (!status) return <Badge tone="warn">Unavailable</Badge>;
  const text = { online: "Online", offline: "Offline", inactive: "Off", unknown: "Unknown", never_reported: "Never reported", warming_up: "Warming up", not_installed: "Not reported" };
  return <Badge dot tone={status === "online" ? "ok" : status === "offline" ? "danger" : status === "warming_up" ? "warn" : undefined}>{text[status]}</Badge>;
}

export function DeviceTimestamps({ data }: { data: PublicSensorStatus }) {
  const format = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";
  return <div className="cell-sub">
    <div>Last heartbeat: {format(data.esp32.lastHeartbeatAt)}</div>
    <div>Last BME280 reading: {format(data.sensor.lastReadingAt)}</div>
  </div>;
}

export function DeviceStatusCell({ deviceId, initial }: { deviceId: string; initial?: PublicSensorStatus }) {
  const data = useDeviceStatus(deviceId, initial);
  return <>
    <div>ESP32 <DeviceBadge status={data?.esp32.status} /></div>
    <div>BME280 <DeviceBadge status={data?.sensor.status} /></div>
    <div>CO₂ <DeviceBadge status={data?.co2.status} /></div>
    {data?.co2.ppm != null && data.co2.lastReadingAt && <div className="cell-sub">Last CO₂: {data.co2.ppm} ppm · {new Date(data.co2.lastReadingAt).toLocaleString()}</div>}
    {data && <DeviceTimestamps data={data} />}
  </>;
}
