"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Snapshot {
  date: string;
  portfolio_value: number;
  cumulative_return: number;
  daily_return: number;
}

interface Props {
  data: Snapshot[];
  initialCash?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPos = d.cumulative_return >= 0;
  return (
    <div
      style={{
        background: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#71717a", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#fafafa" }}>
        ${d.portfolio_value.toLocaleString("en", { maximumFractionDigits: 0 })}
      </div>
      <div style={{ color: isPos ? "#22c55e" : "#ef4444" }}>
        {isPos ? "+" : ""}
        {(d.cumulative_return * 100).toFixed(2)}%
      </div>
    </div>
  );
};

export default function EquityCurve({ data, initialCash = 100_000 }: Props) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#71717a",
          fontSize: 12,
        }}
      >
        No data yet
      </div>
    );
  }

  const latestReturn = data[data.length - 1]?.cumulative_return ?? 0;
  const lineColor = latestReturn >= 0 ? "#c8f542" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickFormatter={(v) => v.slice(5)} // "MM-DD"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={initialCash} stroke="#27272a" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="portfolio_value"
          stroke={lineColor}
          strokeWidth={1.5}
          dot={false}
          fill="rgba(200,245,66,0.05)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
