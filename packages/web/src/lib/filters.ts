import { THERMAL_VOTES, type ThermalVote } from "@hitl/shared";
import type { FeedbackFilter } from "./feedback";
import { findRoomByCode } from "./readings";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, name: string): string {
  const v = sp[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function day(s: string, endOfDay: boolean): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  // Dates in the filter are local (Malaysia, UTC+8) calendar days.
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Reads ?room=&vote=&from=&to= into a feedback filter. */
export async function feedbackFilterFrom(sp: SearchParams): Promise<FeedbackFilter & { roomCode: string; voteRaw: string }> {
  const roomCode = param(sp, "room");
  const voteRaw = param(sp, "vote");
  const room = roomCode ? await findRoomByCode(roomCode) : null;
  return {
    roomCode,
    voteRaw,
    // Unknown room code: filter to nothing rather than silently showing everything.
    roomId: roomCode ? (room?.id ?? "00000000-0000-0000-0000-000000000000") : undefined,
    vote: THERMAL_VOTES.includes(voteRaw as ThermalVote) ? (voteRaw as ThermalVote) : undefined,
    from: day(param(sp, "from"), false),
    to: day(param(sp, "to"), true),
  };
}
