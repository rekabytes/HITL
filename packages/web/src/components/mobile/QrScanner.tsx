"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseRoomCode, roomPath } from "@/lib/room-code";
import { Icon } from "../Icon";

type Detect = (source: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: string[] }): BarcodeDetectorLike;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

/** Uses the browser's built-in detector (Chrome on Android) and falls back to jsQR (Safari, Firefox). */
async function makeDetector(): Promise<Detect> {
  if (window.BarcodeDetector) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes("qr_code")) {
        const d = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => (await d.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // fall through to jsQR
    }
  }
  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // Scan a downscaled frame: plenty for a door sign and much faster on old phones.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

type State = "starting" | "scanning" | "denied" | "unavailable";

export function QrScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<State>("starting");
  const [hint, setHint] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (err) {
        setState((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      setState("scanning");

      const detect = await makeDetector();
      const loop = async () => {
        if (stopped || !video.current || !canvas.current) return;
        const text = await detect(video.current, canvas.current).catch(() => null);
        if (text) {
          const code = parseRoomCode(text);
          if (code) {
            stopped = true;
            stream?.getTracks().forEach((t) => t.stop());
            navigator.vibrate?.(40);
            router.push(roomPath(code));
            return;
          }
          setHint("That QR code is not a HITL room code.");
        }
        timer = setTimeout(loop, 250);
      };
      void loop();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="m-scanner">
      <div className="m-viewfinder">
        <video ref={video} playsInline muted aria-label="Camera view" />
        <canvas ref={canvas} hidden />
        {state === "scanning" && <div className="m-reticle" aria-hidden />}
        {state !== "scanning" && (
          <div className="m-scan-msg">
            <Icon name={state === "starting" ? "camera" : "alert-circle"} size={28} strokeWidth={1.6} />
            {state === "starting" && <p>Starting the camera…</p>}
            {state === "denied" && <p>Camera access was blocked. Allow it in your browser settings, or type the room code below.</p>}
            {state === "unavailable" && (
              <p>The camera is not available here. Use your phone camera on the door QR, or type the room code below.</p>
            )}
          </div>
        )}
      </div>
      {state === "scanning" && (
        <p className="m-scan-hint" role="status">
          {hint || "Point at the QR code on the room door."}
        </p>
      )}
    </div>
  );
}
