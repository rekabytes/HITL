"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { THERMAL_VOTE_LABELS, THERMAL_VOTES, type ThermalVote } from "@hitl/shared";
import { roomPath } from "@/lib/room-code";
import { sendVote } from "@/lib/vote-queue";
import { Icon, type IconName } from "../Icon";

const VOTE_UI: Record<ThermalVote, { icon: IconName; hint: string }> = {
  too_cold: { icon: "cloud-snow", hint: "I'm cold" },
  perfect: { icon: "smile", hint: "Feels right" },
  too_hot: { icon: "sun", hint: "I'm warm" },
};

type Done = "sent" | "queued";

/** The two-tap vote: pick how the room feels, optionally add a note, send. */
export function VoteForm({ userId, roomCode }: { userId: string; roomCode: string }) {
  const router = useRouter();
  const [vote, setVote] = useState<ThermalVote | null>(null);
  // null means "follow the vote": perfect counts as comfortable, the others do not.
  const [comfortable, setComfortable] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const isComfortable = comfortable ?? vote === "perfect";

  async function submit() {
    if (!vote || busy) return;
    setBusy(true);
    setError("");
    const r = await sendVote(userId, {
      roomCode,
      vote,
      comfortable: isComfortable,
      comment: comment.trim(),
      votedAt: new Date().toISOString(),
    });
    setBusy(false);
    if (r.status === "sent" || r.status === "queued") {
      setDone(r.status);
      router.refresh();
    } else if (r.status === "signed_out") {
      router.push(`/login?next=${encodeURIComponent(roomPath(roomCode))}`);
    } else {
      setError(r.message);
    }
  }

  if (done) {
    return (
      <div className={`m-done ${done}`} role="status">
        <span className="m-done-icon">
          <Icon name={done === "sent" ? "check-circle" : "upload-cloud"} size={30} />
        </span>
        <h2>{done === "sent" ? "Thanks, your vote is in" : "Saved on your phone"}</h2>
        <p className="muted">
          {done === "sent"
            ? "Facilities see it next to the room's sensor readings. If enough people agree, they get an alert."
            : "You are offline. The vote will send by itself when you are back online, with the time you cast it."}
        </p>
        <div className="m-done-actions">
          <Link href="/app" className="btn btn-primary btn-block">
            <Icon name="home" size={15} />
            Done
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => {
              setDone(null);
              setVote(null);
              setComfortable(null);
              setComment("");
            }}
          >
            Vote again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m-vote">
      <h2 className="m-q">How does the room feel right now?</h2>
      <div className="m-vote-grid" role="radiogroup" aria-label="How the room feels">
        {THERMAL_VOTES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={vote === v}
            className={`m-vote-btn v-${v}${vote === v ? " selected" : ""}`}
            onClick={() => {
              setVote(v);
              setComfortable(null);
            }}
          >
            <Icon name={VOTE_UI[v].icon} size={30} strokeWidth={1.8} />
            <strong>{THERMAL_VOTE_LABELS[v]}</strong>
            <span>{VOTE_UI[v].hint}</span>
          </button>
        ))}
      </div>

      {vote && (
        <div className="m-vote-more">
          <fieldset className="m-seg">
            <legend>Overall, are you comfortable?</legend>
            <div>
              <button type="button" className={isComfortable ? "on" : ""} aria-pressed={isComfortable} onClick={() => setComfortable(true)}>
                Yes
              </button>
              <button type="button" className={!isComfortable ? "on" : ""} aria-pressed={!isComfortable} onClick={() => setComfortable(false)}>
                No
              </button>
            </div>
          </fieldset>
          <label>
            Anything else? <span className="faint">(optional)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              placeholder="e.g. cold air blowing on my desk, stuffy after lunch"
              rows={3}
            />
          </label>
          {error && (
            <p className="msg msg-error" role="alert">
              <Icon name="alert-circle" size={14} />
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={submit} disabled={busy}>
            {busy ? <Icon name="refresh-cw" size={16} className="spin" /> : <Icon name="send" size={16} />}
            Send vote
          </button>
        </div>
      )}
    </div>
  );
}
