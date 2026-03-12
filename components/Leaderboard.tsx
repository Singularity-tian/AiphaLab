"use client";

import { useRouter } from "next/navigation";

interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  portfolioValue: number;
  cumulativeReturn: number;
  dailyReturn: number;
  tradeCount: number;
}

interface Props {
  data: LeaderboardEntry[];
}

export default function Leaderboard({ data }: Props) {
  const router = useRouter();

  return (
    <div
      style={{
        background: "#111113",
        border: "1px solid #27272a",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #27272a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{ fontFamily: '"Instrument Serif", serif', fontSize: 16, fontWeight: 400 }}
        >
          Leaderboard
        </span>
        <span style={{ fontSize: 11, color: "#71717a" }}>{data.length} traders</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["#", "Trader", "Return", "Today", "Trades"].map((h) => (
                <th
                  key={h}
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "1.2px",
                    color: "#71717a",
                    fontWeight: 400,
                    textAlign: "left",
                    padding: "10px 16px",
                    borderBottom: "1px solid #27272a",
                    background: "#111113",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const isPos = row.cumulativeReturn >= 0;
              const isDailyPos = row.dailyReturn >= 0;
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/traders/${row.id}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#18181b";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid #1c1c1f",
                      fontSize: 11,
                      color: "#71717a",
                    }}
                  >
                    {row.rank}
                  </td>
                  <td
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid #1c1c1f",
                      fontSize: 12,
                      color: "#fafafa",
                      fontWeight: 500,
                    }}
                  >
                    {row.name}
                  </td>
                  <td
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid #1c1c1f",
                      fontSize: 12,
                      color: isPos ? "#22c55e" : "#ef4444",
                      fontWeight: 500,
                    }}
                  >
                    {isPos ? "+" : ""}
                    {(row.cumulativeReturn * 100).toFixed(2)}%
                  </td>
                  <td
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid #1c1c1f",
                      fontSize: 12,
                      color: isDailyPos ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {isDailyPos ? "+" : ""}
                    {(row.dailyReturn * 100).toFixed(2)}%
                  </td>
                  <td
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid #1c1c1f",
                      fontSize: 12,
                      color: "#a1a1aa",
                    }}
                  >
                    {row.tradeCount}
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", color: "#71717a", fontSize: 12 }}>
                  No data yet. Run: <code style={{ color: "#c8f542" }}>tsx scripts/run.ts</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
