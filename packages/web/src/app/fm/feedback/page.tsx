import type { Metadata } from "next";
import Link from "next/link";
import { THERMAL_VOTES, THERMAL_VOTE_LABELS } from "@hitl/shared";
import { Icon } from "@/components/Icon";
import { Badge, EmptyRow, PageHeader } from "@/components/ui";
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
  const filtered = ["room", "vote", "from", "to"].some((k) => param(sp, k));

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const k of ["room", "vote", "from", "to"]) if (param(sp, k)) p.set(k, param(sp, k));
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };

  return (
    <>
      <PageHeader
        eyebrow={{ icon: "message-square", text: "Facility management" }}
        title="Feedback log"
        sub="Every vote, with the room conditions recorded at that moment."
      >
        <a className="btn btn-ghost" href={`/fm/feedback/export?${qs({})}`}>
          <Icon name="download" size={15} />
          Download CSV
        </a>
      </PageHeader>
      <section className="panel panel-flush">
        <form className="toolbar" method="get">
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
              <option value="">Any vote</option>
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
          <button className="btn btn-primary" type="submit">
            <Icon name="filter" size={15} />
            Filter
          </button>
          {filtered && (
            <Link href="/fm/feedback" className="btn btn-ghost">
              <Icon name="x" size={15} />
              Clear
            </Link>
          )}
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Room</th>
                <th>Vote</th>
                <th>Comfortable</th>
                <th className="num">Temp</th>
                <th className="num">RH</th>
                <th>Comment</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={8} icon="message-square">No feedback matches.</EmptyRow>}
              {rows.slice(0, PAGE).map((f) => (
                <tr key={f.id}>
                  <td className="small nowrap muted">{formatDateTime(f.createdAt)}</td>
                  <td className="cell-title">{f.roomCode}</td>
                  <td><VoteBadge vote={f.vote} /></td>
                  <td>
                    {f.comfortable ? <Badge tone="ok" icon="check">Yes</Badge> : <Badge icon="x">No</Badge>}
                  </td>
                  <td className="num">{f.temperatureC !== null ? `${f.temperatureC.toFixed(1)} °C` : "—"}</td>
                  <td className="num">{f.humidityPct !== null ? `${f.humidityPct.toFixed(0)}%` : "—"}</td>
                  <td className="small">{f.comment || <span className="faint">—</span>}</td>
                  <td className="small muted nowrap">{f.userName ?? f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(page > 1 || hasNext) && (
          <div className="pager">
            {page > 1 ? (
              <Link className="btn btn-ghost btn-sm" href={`?${qs({ page: String(page - 1) })}`}>
                <Icon name="chevron-left" size={14} />
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="small muted">Page {page}</span>
            {hasNext ? (
              <Link className="btn btn-ghost btn-sm" href={`?${qs({ page: String(page + 1) })}`}>
                Older
                <Icon name="chevron-right" size={14} />
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>
    </>
  );
}
