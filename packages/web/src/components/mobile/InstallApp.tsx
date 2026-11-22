"use client";

import { useEffect, useState } from "react";
import { INSTALL_EVENT } from "../PwaRegister";
import { Icon } from "../Icon";

type Mode = "unknown" | "installed" | "prompt" | "ios" | "manual";

function detect(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  if (window.__hitlInstall) return "prompt";
  // iPadOS reports itself as a Mac; touch support tells them apart.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "manual";
}

/** Install button where the browser supports it, Add to Home Screen steps on iPhone. */
export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("unknown");

  useEffect(() => {
    setMode(detect());
    const update = () => setMode(detect());
    window.addEventListener(INSTALL_EVENT, update);
    return () => window.removeEventListener(INSTALL_EVENT, update);
  }, []);

  if (mode === "unknown") return null;
  if (compact && (mode === "installed" || mode === "manual")) return null;

  if (mode === "installed") {
    return (
      <p className="m-install-note">
        <Icon name="check-circle" size={15} /> Installed on this device.
      </p>
    );
  }
  if (mode === "prompt") {
    return (
      <button
        type="button"
        className={compact ? "m-install-chip" : "btn btn-primary btn-block"}
        onClick={async () => {
          const e = window.__hitlInstall;
          if (!e) return;
          await e.prompt();
          await e.userChoice.catch(() => undefined);
          window.__hitlInstall = null;
          setMode(detect());
        }}
      >
        <Icon name="download" size={15} />
        Install the app
      </button>
    );
  }
  if (mode === "ios") {
    return (
      <div className="m-install-ios">
        <strong>
          <Icon name="smartphone" size={15} /> Add to your Home Screen
        </strong>
        <ol>
          <li>
            Tap <Icon name="share" size={14} label="Share" /> Share in Safari.
          </li>
          <li>Choose Add to Home Screen.</li>
          <li>Open HITL from your Home Screen next time.</li>
        </ol>
      </div>
    );
  }
  return (
    <p className="m-install-note">
      <Icon name="info" size={15} /> To install, open your browser menu and choose Install app or Add to Home screen.
    </p>
  );
}
