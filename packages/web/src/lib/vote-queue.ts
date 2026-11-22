// Browser-only. Sends occupant votes to /api/feedback and keeps the ones that
// could not be sent (no signal, server down) in localStorage until they can.
// Each queued vote carries `votedAt`, so the server pairs it with the room
// conditions at the moment it was cast rather than when it finally arrives.
// Queued votes are tagged with the user who cast them and only ever sent
// while that same user is signed in, so a shared phone cannot mix them up.
import type { ThermalVote } from "@hitl/shared";

export interface VotePayload {
  roomCode: string;
  vote: ThermalVote;
  comfortable: boolean;
  comment: string;
  votedAt: string;
}

interface Queued {
  owner: string;
  payload: VotePayload;
}

export type SendResult =
  | { status: "sent" }
  | { status: "queued" }
  | { status: "error"; message: string }
  | { status: "signed_out" };

const KEY = "hitl:vote-queue";
/** Fired on window whenever the queue changes. */
export const QUEUE_EVENT = "hitl:vote-queue";

function read(): Queued[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as Queued[]).filter((q) => q && typeof q.owner === "string" && q.payload) : [];
  } catch {
    return [];
  }
}

function write(list: Queued[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the vote is lost, nothing else to do.
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

export function queuedCount(owner: string): number {
  return read().filter((q) => q.owner === owner).length;
}

/** Drops this user's queued votes, for example when they sign out. */
export function clearQueue(owner: string) {
  write(read().filter((q) => q.owner !== owner));
}

type Outcome = "ok" | "drop" | "retry" | "signed_out";

async function post(p: VotePayload): Promise<{ outcome: Outcome; message?: string }> {
  let res: Response;
  try {
    res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(p),
    });
  } catch {
    return { outcome: "retry" }; // offline or the server is unreachable
  }
  if (res.ok) return { outcome: "ok" };
  if (res.status === 401) return { outcome: "signed_out" };
  if (res.status === 429 || res.status >= 500) return { outcome: "retry" };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { outcome: "drop", message: body?.error ?? `Could not send (${res.status}).` };
}

/** Sends one vote now, or queues it when the network or server is not there. */
export async function sendVote(owner: string, payload: VotePayload): Promise<SendResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    write([...read(), { owner, payload }]);
    return { status: "queued" };
  }
  const r = await post(payload);
  if (r.outcome === "ok") return { status: "sent" };
  if (r.outcome === "signed_out") return { status: "signed_out" };
  if (r.outcome === "retry") {
    write([...read(), { owner, payload }]);
    return { status: "queued" };
  }
  return { status: "error", message: r.message ?? "Could not send." };
}

let flushing = false;

/**
 * Tries this user's queued votes in order and stops at the first one that
 * still cannot go. Returns how many were sent.
 */
export async function flushQueue(owner: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const next = read().find((q) => q.owner === owner);
      if (!next) break;
      const r = await post(next.payload);
      if (r.outcome === "retry" || r.outcome === "signed_out") break;
      if (r.outcome === "ok") sent++;
      // Sent, or refused for good (room deleted, too old): either way it leaves the queue.
      write(read().filter((q) => !(q.owner === next.owner && q.payload.votedAt === next.payload.votedAt)));
    }
  } finally {
    flushing = false;
  }
  return sent;
}
