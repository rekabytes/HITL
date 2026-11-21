import type { Metadata } from "next";
import Link from "next/link";
import { THERMAL_VOTES, THERMAL_VOTE_LABELS } from "@hitl/shared";
import { PageHeader } from "@/components/Shell";
import { VoteBadge } from "@/components/VoteBadge";
import { requireStaff } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback";
import { feedbackFilterFrom, param, type SearchParams } from "@/lib/filters";
import { listRooms } from "@/lib/readings";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Feedback log" };

const PAGE = 50;

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const filter = await feedbackFilterFrom(sp);
  const [rows, roomRows] = await Promise.all([
    listFeedback({ ...filter, limit: PAGE + 1, offset: (page - 1) * PAGE }),
    listRooms(),
  ]);
  const hasNext = rows.length > PAGE;

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const k of ["room", "vote", "from", "to"]) if (param(sp, k)) p.set(k, param(sp, k));
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };

  return (
    <>
      <PageHeader title="Feedback log" sub="Every vote, with the room conditions recorded at that moment.">
        <a className="btn btn-ghost" href={`/fm/feedback/export?${qs({})}`}>
          Download CSV
        </a>
      </PageHeader>
      <section className="panel">
        <form className="filters" method="get">
          <label>
            Room
            <select name="room" defaultValue={filter.roomCode}>
              <option value="">All rooms</option>
              {roomRows.map((r) => (
                <option key={r.id} value={r.code}>{r.code}</option>
              ))}
            </select>
          </label>
          <label>
            Vote
            <select name="vote" defaultValue={filter.voteRaw}>
              <option value="">Any</option>
              {THERMAL_VOTES.map((v) => (
                <option key={v} value={v}>{THERMAL_VOTE_LABELS[v]}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input type="date" name="from" defaultValue={param(sp, "from")} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={param(sp, "to")} />
          </label>
          <button className="btn btn-primary" type="submit">Filter</button>
          <Link href="/fm/feedback" className="btn btn-ghost">Clear</Link>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Room</th>
                <th>Vote</th>
                <th>Comfortable</th>
                <th>Temp</th>
                <th>RH</th>
                <th>Comment</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="empty">No feedback matches.</td></tr>
              )}
              {rows.slice(0, PAGE).map((f) => (
                <tr key={f.id}>
                  <td className="small">{formatDateTime(f.createdAt)}</td>
                  <td><strong>{f.roomCode}</strong></td>
                  <td><VoteBadge vote={f.vote} /></td>
                  <td>{f.comfortable ? "Yes" : "No"}</td>
                  <td className="num">{f.temperatureC?.toFixed(1) ?? "—"}</td>
                  <td className="num">{f.humidityPct?.toFixed(0) ?? "—"}</td>
                  <td>{f.comment}</td>
                  <td className="small muted">{f.userName ?? f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          {page > 1 ? <Link href={`?${qs({ page: String(page - 1) })}`}>Newer</Link> : <span />}
          {hasNext && <Link href={`?${qs({ page: String(page + 1) })}`}>Older</Link>}
        </div>
      </section>
    </>
  );
}
