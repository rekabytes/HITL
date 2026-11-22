"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { PublicSensorStatus } from "@/lib/public-status";
import { DeviceStatusCell, useDeviceStatus } from "./LiveDeviceStatus";

export function SensorStatusModal({ initial }: { initial: PublicSensorStatus }) {
  const props = useDeviceStatus(initial.deviceId, initial) ?? initial;
  const reading = props.sensor;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <>
      <button type="button" className="sensor-device-button" onClick={() => setOpen(true)} aria-label={`View status for ${props.deviceId}`}>
        <span className="stat-icon" style={{ width: 34, height: 34 }}><Icon name="cpu" size={16} /></span>
        <span>
          <span className="cell-title">{props.deviceId}</span>
          <span className="cell-sub">{[props.label, props.firmwareVersion && `firmware ${props.firmwareVersion}`].filter(Boolean).join(" · ") || "No details"}</span>
        </span>
        <Icon name="chevron-right" size={15} className="sensor-device-chevron" />
      </button>

      {open && (
        <div className="sensor-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="sensor-modal" role="dialog" aria-modal="true" aria-labelledby={`sensor-modal-${props.deviceId}`}>
            <div className="sensor-modal-head">
              <div>
                <div className="eyebrow"><Icon name="cpu" size={13} /> Sensor details</div>
                <h2 id={`sensor-modal-${props.deviceId}`}>{props.deviceId}</h2>
                <p className="sub">{props.label || "ESP32 environmental sensor"}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close sensor details">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="sensor-status-list">
              <DeviceStatusCell deviceId={initial.deviceId} initial={initial} />
            </div>

            <div className="sensor-modal-grid">
              <div><span>Rooms</span><strong>{props.rooms.length ? props.rooms.join(", ") : "Not assigned"}</strong></div>
              <div><span>Firmware</span><strong>{props.firmwareVersion || "Not set"}</strong></div>
              <div><span>Last real temperature</span><strong>{reading.temperatureC === null ? "—" : `${reading.temperatureC.toFixed(1)} °C`}</strong></div>
              <div><span>Last real humidity</span><strong>{reading.humidityPct === null ? "—" : `${reading.humidityPct.toFixed(0)}%`}</strong></div>
              {reading.pressureHpa !== null && <div><span>Last real pressure</span><strong>{reading.pressureHpa.toFixed(0)} hPa</strong></div>}
            </div>

            <div className="sensor-modal-foot">
              <span><Icon name="info" size={14} /> Sensor status is unknown when the ESP32 stops reporting.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
