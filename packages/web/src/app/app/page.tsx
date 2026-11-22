import type { Metadata } from "next";
import Link from "next/link";
import { InstallApp } from "@/components/mobile/InstallApp";
import { LiveConditions } from "@/components/mobile/LiveConditions";
import { RoomCodeForm } from "@/components/mobile/RoomCodeForm";
import { Icon } from "@/components/Icon";
import { VoteBadge } from "@/components/VoteBadge";
import { requireUser } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";
import { lastRoomCode, roomSummary } from "@/lib/occupant";
import { roomPath } from "@/lib/room-code";
import { timeAgo } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function OccupantHome() {
  const user = await requireUser();
  const [lastCode, recent] = await Promise.all([lastRoomCode(user.id), listFeedback({ userId: user.id, limit: 3 })]);
  const room = lastCode ? await roomSummary(lastCode) : null;
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <div className="m-stack">
      <section>
        <h1 className="m-h1">Hi {firstName}</h1>
        <p className="muted">How is your room? Scan the QR code on the door to tell facilities.</p>
      </section>

      <Link href="/app/scan" className="m-scan-cta">
        <span className="m-scan-cta-icon">
          <Icon name="maximize" size={26} />
        </span>
        <span>
          <strong>Scan room QR</strong>
          <small>Takes about five seconds</small>
        </span>
        <Icon name="chevron-right" size={20} />
      </Link>

      <RoomCodeForm />

      {room && (
        <section className="m-card">
          <div className="m-card-head">
            <div>
              <div className="m-room-code">{room.code}</div>
              <div className="muted small">
                <Icon name="map-pin" size={12} /> {room.name}
                {room.building ? ` · ${room.building}` : ""}
              </div>
            </div>
            <span className="badge">Your last room</span>
          </div>
          <LiveConditions code={room.code} initial={room.conditions} />
          <Link href={roomPath(room.code)} className="btn btn-primary btn-block">
            <Icon name="message-square" size={15} />
            Vote for {room.code}
          </Link>
        </section>
      )}

      {recent.length > 0 && (
        <section className="m-card">
          <div className="m-card-head">
            <h2>Your recent votes</h2>
            <Link href="/app/history" className="small">
              See all
            </Link>
          </div>
          <ul className="m-list">
            {recent.map((f) => (
              <li key={f.id}>
                <VoteBadge vote={f.vote} />
                <span className="m-list-main">
                  <strong>{f.roomCode}</strong>
                  {f.comment && <span className="muted"> · {f.comment}</span>}
                </span>
                <span className="faint tiny nowrap">{timeAgo(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InstallApp compact />
    </div>
  );
}
