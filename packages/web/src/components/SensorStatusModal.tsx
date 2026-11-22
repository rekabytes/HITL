"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Badge } from "./ui";

interface SensorStatusModalProps {
  deviceId: string;
  label: string | null;
  firmwareVersion: string | null;
  rooms: string[];
  lastSeen: string | null;
  online: boolean;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  lastReading: string | null;
}

function StatusLine({ label, online, detail }: { label: string; online: boolean; detail: string }) {
  return (
    <div className="sensor-status-line">
      <span className={`sensor-status-icon ${online ? "is-online" : "is-offline"}`}>
        <Icon name={online ? "check" : "x"} size={15} strokeWidth={2.5} />
      </span>
      <span className="sensor-status-copy">
        <strong>{label}</strong>
        <span>{detail}</span>
      </span>
      <Badge tone={online ? "ok" : "danger"} dot>{online ? "Online" : "Offline"}</Badge>
    </div>
  );
}

export function SensorStatusModal(props: SensorStatusModalProps) {
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

  const sensorOnline = props.online && props.temperature !== null && props.humidity !== null;
  const lastSeenText = props.lastSeen ? new Date(props.lastSeen).toLocaleString() : "Never";
  const lastReadingText = props.lastReading ? new Date(props.lastReading).toLocaleString() : "No reading received";

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
              <StatusLine label="ESP32 connection" online={props.online} detail={props.online ? `Last seen ${lastSeenText}` : `Last seen ${lastSeenText}`} />
              <StatusLine label="Sensor readings" online={sensorOnline} detail={sensorOnline ? `Latest reading ${lastReadingText}` : "No valid temperature and humidity reading"} />
            </div>

            <div className="sensor-modal-grid">
              <div><span>Rooms</span><strong>{props.rooms.length ? props.rooms.join(", ") : "Not assigned"}</strong></div>
              <div><span>Firmware</span><strong>{props.firmwareVersion || "Not set"}</strong></div>
              <div><span>Temperature</span><strong>{props.temperature === null ? "—" : `${props.temperature.toFixed(1)} °C`}</strong></div>
              <div><span>Humidity</span><strong>{props.humidity === null ? "—" : `${props.humidity.toFixed(0)}%`}</strong></div>
              {props.pressure !== null && <div><span>Pressure</span><strong>{props.pressure.toFixed(0)} hPa</strong></div>}
            </div>

            <div className="sensor-modal-foot">
              <span><Icon name="info" size={14} /> Status is based on the latest reading received by HITL.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
