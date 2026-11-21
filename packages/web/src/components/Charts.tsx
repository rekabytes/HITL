"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = { temp: "#d9534f", hum: "#2b6cb0", cold: "#2b6cb0", perfect: "#0f9f6e", hot: "#c0392b" };

export interface TrendPoint {
  label: string;
  temperatureC: number | null;
  humidityPct: number | null;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <p className="empty">No readings in this range.</p>;
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#e5ece9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis yAxisId="t" tick={{ fontSize: 11 }} unit="°" domain={["auto", "auto"]} />
          <YAxis yAxisId="h" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Line yAxisId="t" type="monotone" dataKey="temperatureC" name="Temperature °C" stroke={COLORS.temp} dot={false} strokeWidth={2} connectNulls />
          <Line yAxisId="h" type="monotone" dataKey="humidityPct" name="Humidity %" stroke={COLORS.hum} dot={false} strokeWidth={2} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface VotePoint {
  label: string;
  tooCold: number;
  perfect: number;
  tooHot: number;
}

export function VotesChart({ data, empty = "No votes in this range." }: { data: VotePoint[]; empty?: string }) {
  if (data.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#e5ece9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="tooCold" name="Too cold" stackId="v" fill={COLORS.cold} />
          <Bar dataKey="perfect" name="Perfect" stackId="v" fill={COLORS.perfect} />
          <Bar dataKey="tooHot" name="Too hot" stackId="v" fill={COLORS.hot} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
