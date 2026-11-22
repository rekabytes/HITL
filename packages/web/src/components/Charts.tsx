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
import { Icon } from "./Icon";

const COLORS = { temp: "#e0533d", hum: "#2563b8", cold: "#5b8fd6", perfect: "#10a372", hot: "#e0533d" };
const AXIS = { fontSize: 11, fill: "#64756e" };
const TOOLTIP = {
  contentStyle: { borderRadius: 10, border: "1px solid #e4eae7", boxShadow: "0 8px 24px -8px rgb(15 31 26 / 18%)", fontSize: 12 },
  labelStyle: { fontWeight: 600, color: "#0f1f1a" },
};

function NoData({ text }: { text: string }) {
  return (
    <div className="empty">
      <Icon name="bar-chart-2" size={26} strokeWidth={1.6} />
      {text}
    </div>
  );
}

export interface TrendPoint {
  label: string;
  temperatureC: number | null;
  humidityPct: number | null;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <NoData text="No readings in this range." />;
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#eef2f0" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e4eae7" }} minTickGap={28} />
          <YAxis yAxisId="t" tick={AXIS} tickLine={false} axisLine={false} unit="°" domain={["auto", "auto"]} />
          <YAxis yAxisId="h" orientation="right" tick={AXIS} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
          <Tooltip {...TOOLTIP} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="t" type="monotone" dataKey="temperatureC" name="Temperature °C" stroke={COLORS.temp} dot={false} strokeWidth={2} connectNulls />
          <Line yAxisId="h" type="monotone" dataKey="humidityPct" name="Humidity %" stroke={COLORS.hum} dot={false} strokeWidth={2} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Co2Chart({ data }: { data: { label: string; ppm: number | null }[] }) {
  if (!data.some((point) => point.ppm !== null)) return <NoData text="No CO₂ readings in this range." />;
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#eef2f0" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e4eae7" }} minTickGap={28} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, "auto"]} unit=" ppm" />
          <Tooltip {...TOOLTIP} />
          <Line dataKey="ppm" name="CO₂ (ppm)" stroke="#0b8061" dot={{ r: 2 }} strokeWidth={2} />
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
  if (data.length === 0) return <NoData text={empty} />;
  return (
    <div className="chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="22%">
          <CartesianGrid stroke="#eef2f0" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "#e4eae7" }} minTickGap={16} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP} cursor={{ fill: "rgb(16 163 114 / 6%)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="tooCold" name="Too cold" stackId="v" fill={COLORS.cold} />
          <Bar dataKey="perfect" name="Perfect" stackId="v" fill={COLORS.perfect} />
          <Bar dataKey="tooHot" name="Too hot" stackId="v" fill={COLORS.hot} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
