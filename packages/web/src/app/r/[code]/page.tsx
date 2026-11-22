import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LiveConditions } from "@/components/mobile/LiveConditions";
import { MobileShell } from "@/components/mobile/MobileShell";
import { VoteForm } from "@/components/mobile/VoteForm";
import { currentUser } from "@/lib/auth";
import { roomSummary } from "@/lib/occupant";
import { parseRoomCode, roomPath } from "@/lib/room-code";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = parseRoomCode(decodeURIComponent((await params).code));
  return { title: code ? `Room ${code}` : "Room" };
}

/** The page a door QR code opens. Signed-out visitors sign in first and come straight back. */
export default async function RoomVotePage({ params }: Props) {
  const raw = decodeURIComponent((await params).code);
  const code = parseRoomCode(raw);
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(code ? roomPath(code) : "/app")}`);
  if (user.mustChangePassword) redirect("/change-password");

  const room = code ? await roomSummary(code) : null;

  return (
    <MobileShell user={user}>
      {room ? (
        <div className="m-stack">
          <section className="m-room-head">
            <div className="m-room-code xl">{room.code}</div>
            <div className="muted">
              <Icon name="map-pin" size={13} /> {room.name}
              {room.building ? ` · ${room.building}` : ""}
              {room.floor ? ` · Floor ${room.floor}` : ""}
            </div>
          </section>
          <LiveConditions code={room.code} initial={room.conditions} />
          <VoteForm userId={user.id} roomCode={room.code} />
        </div>
      ) : (
        <div className="m-stack">
          <div className="m-card m-notfound">
            <Icon name="alert-triangle" size={28} strokeWidth={1.6} />
            <h1 className="m-h1">Room not found</h1>
            <p className="muted">
              No room has the code <code>{raw.slice(0, 32)}</code>. Check the sign on the door, or ask facilities.
            </p>
            <Link href="/app/scan" className="btn btn-primary btn-block">
              <Icon name="maximize" size={15} />
              Scan again
            </Link>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
