"use client";

import { useEffect, useState } from "react";
import type { RoomConditions } from "@/lib/occupant";
import { Icon } from "../Icon";

const POLL_MS = 60_000;

function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "just now" : `${min} min ago`;
}

/** Current temperature and humidity in a room, refreshed every minute while the screen is open. */
export function LiveConditions({ code, initial }: { code: string; initial: RoomConditions | null }) {
  const [c, setC] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, { cache: "no-store" });
        if (res.ok && !stop) setC(((await res.json()) as { conditions: RoomConditions | null }).conditions);
      } catch {
        // Offline: keep showing the last value with its age.
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [code]);

  if (!c) {
    return (
      <div className="m-conditions empty-cond">
        <Icon name="wifi-off" size={16} />
        No recent sensor reading for this room. Your vote still counts.
      </div>
    );
  }
  return (
    <div className="m-conditions">
      <div className="metrics">
        <div className="metric">
          <div className="m-label">
            <Icon name="thermometer" size={13} /> Temperature
          </div>
          <div className="m-value">
            {c.temperatureC.toFixed(1)}
            <small>°C</small>
          </div>
        </div>
        <div className="metric">
          <div className="m-label">
            <Icon name="droplet" size={13} /> Humidity
          </div>
          <div className="m-value">
            {Math.round(c.humidityPct)}
            <small>%</small>
          </div>
        </div>
      </div>
      <p className="tiny muted">
        <Icon name="clock" size={12} /> Updated {ago(c.recordedAt, now)}
        {c.sensorCount > 1 && ` · average of ${c.sensorCount} sensors`}
      </p>
    </div>
  );
}
