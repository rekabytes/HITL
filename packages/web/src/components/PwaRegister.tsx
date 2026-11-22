"use client";

import { useEffect } from "react";

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __hitlInstall?: InstallPromptEvent | null;
  }
}

/** Fired when the browser offers to install the app, or when it has been installed. */
export const INSTALL_EVENT = "hitl:installable";

/**
 * Registers the service worker and keeps the browser's install offer for the
 * Install button. The worker only runs in production builds: in `next dev` it
 * would cache code that hot reload is about to replace. Set
 * NEXT_PUBLIC_PWA_DEV=1 to try it in development anyway.
 */
export function PwaRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the browser's mini bar
      window.__hitlInstall = e as InstallPromptEvent;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    const onInstalled = () => {
      window.__hitlInstall = null;
      window.dispatchEvent(new Event(INSTALL_EVENT));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_PWA_DEV === "1";
    if (enabled && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("[pwa] service worker:", err));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
