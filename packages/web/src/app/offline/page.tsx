import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { Brand } from "@/components/ui";

export const metadata: Metadata = { title: "Offline" };
// Static so the service worker can cache it at install time and show it with no network.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="m-offline">
      <div className="brand">
        <Brand sub="Room comfort" />
      </div>
      <Icon name="wifi-off" size={36} strokeWidth={1.6} />
      <h1 className="m-h1">You are offline</h1>
      <p className="muted">
        This screen has not been opened on this phone before, so there is nothing saved to show. Rooms you have opened
        while online still work offline, and votes cast offline are sent when you reconnect.
      </p>
      <a href="/app" className="btn btn-primary">
        <Icon name="refresh-cw" size={15} />
        Try again
      </a>
    </div>
  );
}
