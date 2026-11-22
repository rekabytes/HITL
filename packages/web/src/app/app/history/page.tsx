import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty } from "@/components/ui";
import { VoteBadge } from "@/components/VoteBadge";
import { requireUser } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";
import { roomPath } from "@/lib/room-code";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "My votes" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const votes = await listFeedback({ userId: user.id, limit: 100 });

  return (
    <div className="m-stack">
      <section>
        <h1 className="m-h1">My votes</h1>
        <p className="muted">Each vote is stored with what the sensors read in that room at the time.</p>
      </section>
      {votes.length === 0 ? (
        <div className="m-card">
          <Empty icon="message-square">
            No votes yet. <Link href="/app/scan">Scan a room</Link> to give your first one.
          </Empty>
        </div>
      ) : (
        <ul className="m-history">
          {votes.map((f) => (
            <li key={f.id} className="m-card">
              <div className="m-card-head">
                <Link href={roomPath(f.roomCode)} className="m-room-code">
                  {f.roomCode}
                </Link>
                <VoteBadge vote={f.vote} />
              </div>
              <div className="muted small">
                {f.roomName} · {formatDateTime(f.createdAt)}
              </div>
              {f.temperatureC !== null && f.humidityPct !== null ? (
                <div className="m-history-cond small">
                  <span>
                    <Icon name="thermometer" size={13} /> {f.temperatureC.toFixed(1)} °C
                  </span>
                  <span>
                    <Icon name="droplet" size={13} /> {Math.round(f.humidityPct)}%
                  </span>
                </div>
              ) : (
                <div className="faint tiny">No sensor reading at the time.</div>
              )}
              {f.comment && <p className="m-history-comment">“{f.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
