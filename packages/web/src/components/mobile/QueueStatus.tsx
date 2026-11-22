"use client";

import { useEffect, useState } from "react";
import { flushQueue, QUEUE_EVENT, queuedCount } from "@/lib/vote-queue";
import { Icon } from "../Icon";

/**
 * Sends votes that were queued offline as soon as the app opens or the
 * connection comes back, and tells the occupant what is still waiting.
 */
export function QueueStatus({ userId }: { userId: string }) {
  const [waiting, setWaiting] = useState(0);
  const [online, setOnline] = useState(true);
  const [justSent, setJustSent] = useState(0);

  useEffect(() => {
    setWaiting(queuedCount(userId));
    setOnline(navigator.onLine);

    const flush = async () => {
      const n = await flushQueue(userId);
      if (n > 0) {
        setJustSent(n);
        setTimeout(() => setJustSent(0), 4000);
      }
    };
    const onQueue = () => setWaiting(queuedCount(userId));
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && void flush();

    window.addEventListener(QUEUE_EVENT, onQueue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    void flush();
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId]);

  if (justSent > 0) {
    return (
      <div className="m-banner ok" role="status">
        <Icon name="check-circle" size={16} />
        Sent {justSent} saved {justSent === 1 ? "vote" : "votes"}.
      </div>
    );
  }
  if (!online || waiting > 0) {
    return (
      <div className="m-banner warn" role="status">
        <Icon name={online ? "upload-cloud" : "wifi-off"} size={16} />
        <span>
          {!online && waiting === 0 && "You are offline. Votes will be saved and sent later."}
          {waiting > 0 &&
            `${waiting} ${waiting === 1 ? "vote" : "votes"} saved on this phone. ${online ? "Sending…" : "They will send when you are back online."}`}
        </span>
      </div>
    );
  }
  return null;
}
