import { feedbackInput, THERMAL_VOTES, type ThermalVote } from "@hitl/shared";
import { apiUser, isStaff } from "@/lib/auth";
import { listFeedback, submitFeedback } from "@/lib/feedback";
import { json, problem, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { findRoomByCode } from "@/lib/readings";

export const dynamic = "force-dynamic";

/**
 * Occupant app: submit a vote for the room whose QR code was scanned. Takes the
 * session cookie (PWA) or a bearer token. `votedAt` marks a vote queued offline.
 */
export async function POST(req: Request) {
  const user = await apiUser(req);
  if (!user) return problem(401, "Sign in first");
  if (!(await rateLimit(`feedback:${user.id}`, 10, 600))) {
    return problem(429, "Too many votes. Try again in a few minutes.");
  }
  const body = await readJson(req, feedbackInput);
  if (!body.ok) return body.response;

  const result = await submitFeedback(body.data, user.id, "mobile");
  if (!result.ok) return problem(result.status, result.error);
  return json({ status: "stored", id: result.feedback.id, room: result.room.code }, 201);
}

/** Staff only. Query: ?room=L21&vote=too_hot&limit=100&offset=0 */
export async function GET(req: Request) {
  const user = await apiUser(req);
  if (!isStaff(user)) return problem(403, "Staff only");

  const q = new URL(req.url).searchParams;
  const roomCode = q.get("room");
  const room = roomCode ? await findRoomByCode(roomCode) : null;
  if (roomCode && !room) return problem(404, `No room with code ${roomCode}`);
  const vote = q.get("vote");
  const items = await listFeedback({
    roomId: room?.id,
    vote: THERMAL_VOTES.includes(vote as ThermalVote) ? (vote as ThermalVote) : undefined,
    limit: Math.min(Number(q.get("limit")) || 100, 500),
    offset: Number(q.get("offset")) || 0,
  });
  return json({ items });
}
