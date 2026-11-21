import type { Metadata } from "next";
import { sql, type SQL } from "drizzle-orm";
import { TrendChart, VotesChart, type TrendPoint, type VotePoint } from "@/components/Charts";
import { PageHeader } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { param, type SearchParams } from "@/lib/filters";
import { findRoomByCode, listRooms } from "@/lib/readings";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = {
  "24h": { hours: 24, bucket: "hour", fmt: "HH24:00" },
  "7d": { hours: 168, bucket: "hour", fmt: "DD Mon HH24:00" },
  "30d": { hours: 720, bucket: "day", fmt: "DD Mon" },
} as const;
type RangeKey = keyof typeof RANGES;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const sp = await searchParams;
  const rangeKey: RangeKey = (param(sp, "range") as RangeKey) in RANGES ? (param(sp, "range") as RangeKey) : "7d";
  const range = RANGES[rangeKey];
  const roomCode = param(sp, "room");
  const [roomRows, room] = await Promise.all([listRooms(), roomCode ? findRoomByCode(roomCode) : null]);

  const since = new Date(Date.now() - range.hours * 3_600_000);
  const tz = env.timeZone;
  const roomFilter: SQL = room ? sql`and room_id = ${room.id}` : sql``;
  const voteBucket = rangeKey === "24h" ? "hour" : "day";
  const voteFmt = rangeKey === "24h" ? "HH24:00" : "DD Mon";

  const [trend, votes, bands] = await Promise.all([
    // Bucket in a subquery and group by position: bound parameters repeated in
    // SELECT and GROUP BY would not count as the same expression to Postgres.
    db().execute<{ label: string; t: number | null; h: number | null }>(sql`
      select to_char(b, ${range.fmt}) as label, t, h from (
        select date_trunc(${range.bucket}, recorded_at at time zone ${tz}) as b,
               round(avg(temperature_c)::numeric, 1)::float as t,
               round(avg(humidity_pct)::numeric, 0)::float as h
        from sensor_readings
        where recorded_at >= ${since} ${roomFilter}
        group by 1
      ) x order by b`),
    db().execute<{ label: string; too_cold: number; perfect: number; too_hot: number }>(sql`
      select to_char(b, ${voteFmt}) as label, too_cold, perfect, too_hot from (
        select date_trunc(${voteBucket}, created_at at time zone ${tz}) as b,
               count(*) filter (where vote = 'too_cold')::int as too_cold,
               count(*) filter (where vote = 'perfect')::int as perfect,
               count(*) filter (where vote = 'too_hot')::int as too_hot
        from feedback
        where created_at >= ${since} ${roomFilter}
        group by 1
      ) x order by b`),
    // How people vote at each whole degree: this is what the comfort model learns from.
    db().execute<{ label: string; too_cold: number; perfect: number; too_hot: number }>(sql`
      select floor(temperature_c)::int || ' °C' as label,
             count(*) filter (where vote = 'too_cold')::int as too_cold,
             count(*) filter (where vote = 'perfect')::int as perfect,
             count(*) filter (where vote = 'too_hot')::int as too_hot
      from feedback
      where temperature_c is not null and created_at >= ${since} ${roomFilter}
      group by floor(temperature_c)
      order by floor(temperature_c)`),
  ]);

  const trendData: TrendPoint[] = [...trend].map((r) => ({ label: r.label, temperatureC: r.t, humidityPct: r.h }));
  const toVotes = (rows: Iterable<{ label: string; too_cold: number; perfect: number; too_hot: number }>): VotePoint[] =>
    [...rows].map((r) => ({ label: r.label, tooCold: r.too_cold, perfect: r.perfect, tooHot: r.too_hot }));

  return (
    <>
      <PageHeader title="Analytics" sub={room ? `${room.code} · ${room.name}` : "All rooms"} />
      <form className="filters" method="get">
        <label>
          Room
          <select name="room" defaultValue={roomCode}>
            <option value="">All rooms</option>
            {roomRows.map((r) => (
              <option key={r.id} value={r.code}>{r.code}</option>
            ))}
          </select>
        </label>
        <label>
          Range
          <select name="range" defaultValue={rangeKey}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Show</button>
      </form>
      <section className="panel">
        <h2>Temperature and humidity</h2>
        <TrendChart data={trendData} />
      </section>
      <div className="grid grid-2" style={{ marginTop: "1.25rem" }}>
        <section className="panel">
          <h2>Votes over time</h2>
          <VotesChart data={toVotes(votes)} />
        </section>
        <section className="panel">
          <h2>Votes by room temperature</h2>
          <VotesChart data={toVotes(bands)} empty="No votes with a reading attached in this range." />
        </section>
      </div>
    </>
  );
}
