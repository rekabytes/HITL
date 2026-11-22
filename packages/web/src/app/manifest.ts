import type { MetadataRoute } from "next";
import { THEME } from "@/lib/theme";

/** Web app manifest: makes the occupant app installable to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "HITL Room Comfort",
    short_name: "HITL",
    description: "Tell facilities how your room feels. Scan the QR on the door, vote in two taps.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f6",
    theme_color: THEME.side,
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Scan room", short_name: "Scan", url: "/app/scan", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
