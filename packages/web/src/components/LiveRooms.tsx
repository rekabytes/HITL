"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { VoteBadge } from "./VoteBadge";

export interface LiveRoom {
  id: string;
  code: string;
  name: string;
  buildingName: string;
  temperatureC: number | null;
  humidityPct: number | null;
  recordedAt: string | null;
  level: "ok" | "advice" | "action" | "none";
  advice: string | null;
  votes: { tooCold: number; perfect: number; tooHot: number };
  openAlerts: number;
}

type Event =
  | { type: "reading"; roomId: string; temperatureC: number; humidityPct: number; recordedAt: string }
  | { type: "feedback"; roomId: string; vote: "too_cold" | "perfect" | "too_hot" }
  | { type: "alert"; roomId: string | null };

const STALE_MS = 30 * 60_000;

function ago(iso: string | null, now: number) {
  if (!iso) return "no data yet";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/**
 * Room cards that update from /api/stream. The server sends readings, votes and
 * alerts as they happen; advice text refreshes on the next page load.
 */
export function LiveRooms({ initial }: { initial: LiveRoom[] }) {
  const [rooms, setRooms] = useState(initial);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let ev: Event;
      try {
        ev = JSON.parse(msg.data) as Event;
      } catch {
        return;
      }
      if (!ev.roomId) return;
      const roomId = ev.roomId;
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== roomId) return r;
          if (ev.type === "reading") {
            return { ...r, temperatureC: ev.temperatureC, humidityPct: ev.humidityPct, recordedAt: ev.recordedAt };
          }
          if (ev.type === "feedback") {
            const key = ev.vote === "too_cold" ? "tooCold" : ev.vote === "too_hot" ? "tooHot" : "perfect";
            return { ...r, votes: { ...r.votes, [key]: r.votes[key] + 1 } };
          }
          return { ...r, openAlerts: r.openAlerts + 1 };
        }),
      );
      setFlash((f) => ({ ...f, [roomId]: Date.now() }));
    };
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      es.close();
      clearInterval(tick);
    };
  }, []);

  if (rooms.length === 0) {
    return (
      <div className="panel empty">
        <Icon name="home" size={26} strokeWidth={1.6} />
        No rooms yet. An admin adds them under Rooms and sensors.
      </div>
    );
  }

  return (
    <>
      <div className="live" aria-live="polite">
        <span className={connected ? "pulse" : "pulse off"} />
        {connected ? "Live updates on" : "Reconnecting to live updates"}
      </div>
      <div className="grid grid-cards">
        {rooms.map((r) => {
          const stale = !r.recordedAt || now - new Date(r.recordedAt).getTime() > STALE_MS;
          const level = stale ? "none" : r.level;
          return (
            <article key={`${r.id}-${flash[r.id] ?? 0}`} className={`room-card level-${level} ${flash[r.id] ? "flash" : ""}`}>
              <div className="top">
                <span className="code">{r.code}</span>
                {r.openAlerts > 0 ? (
                  <span className="badge badge-danger">
                    <Icon name="bell" size={12} />
                    {r.openAlerts} open
                  </span>
                ) : stale ? (
                  <span className="badge badge-warn">
                    <Icon name="wifi-off" size={12} />
                    quiet
                  </span>
                ) : (
                  <span className="badge badge-ok">
                    <Icon name="wifi" size={12} />
                    live
                  </span>
                )}
              </div>
              <div className="where">
                <Icon name="map-pin" size={12} />
                {r.name} · {r.buildingName}
              </div>
              <div className="metrics">
                <div className="metric">
                  <div className="m-label">
                    <Icon name="thermometer" size={12} />
                    Temperature
                  </div>
                  <div className="m-value">
                    {r.temperatureC !== null ? r.temperatureC.toFixed(1) : "—"}
                    <small>°C</small>
                  </div>
                </div>
                <div className="metric">
                  <div className="m-label">
                    <Icon name="droplet" size={12} />
                    Humidity
                  </div>
                  <div className="m-value">
                    {r.humidityPct !== null ? r.humidityPct.toFixed(0) : "—"}
                    <small>%</small>
                  </div>
                </div>
              </div>
              <div className="votes" title="Votes in the last 30 minutes">
                <VoteBadge vote="too_cold" count={r.votes.tooCold} />
                <VoteBadge vote="perfect" count={r.votes.perfect} />
                <VoteBadge vote="too_hot" count={r.votes.tooHot} />
              </div>
              <div className="room-foot">
                <Icon
                  name={stale ? "clock" : level === "action" ? "alert-triangle" : level === "advice" ? "info" : "check-circle"}
                  size={14}
                />
                <span>
                  {stale ? `Last reading ${ago(r.recordedAt, now)}. Check the sensor.` : (r.advice ?? `All good. Updated ${ago(r.recordedAt, now)}.`)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
