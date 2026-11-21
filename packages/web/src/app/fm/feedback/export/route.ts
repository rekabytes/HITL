import { apiUser, isStaff } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";
import { feedbackFilterFrom } from "@/lib/filters";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Quote everything and neutralise spreadsheet formulas in free text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  if (!isStaff(await apiUser(req))) return problem(403, "Staff only");
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filter = await feedbackFilterFrom(sp);
  const rows = await listFeedback({ ...filter, limit: 50_000 });

  const header = ["created_at", "room_code", "room_name", "vote", "comfortable", "temperature_c", "humidity_pct", "comment", "user", "source"];
  const lines = rows.map((r) =>
    [r.createdAt, r.roomCode, r.roomName, r.vote, r.comfortable, r.temperatureC, r.humidityPct, r.comment, r.userName, r.source]
      .map(cell)
      .join(","),
  );
  return new Response([header.join(","), ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="feedback-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
