"use client";

import Link from "next/link";

interface Props {
  id: number;
  name: string;
  riskTolerance: string;
  cumulativeReturn: number;
  dailyReturn: number;
  mood: string;
  runCount: number;
}

const MOOD_EMOJI: Record<string, string> = {
  bullish: "🟢",
  cautious: "🟡",
  frustrated: "🔴",
  confident: "🔵",
  anxious: "🟠",
  neutral: "⚪",
  euphoric: "✨",
  depressed: "⬛",
};

function nameToColor(name: string): string {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffff;
  const r = (hash >> 16) & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = hash & 0xff;
  return `rgb(${r},${g},${b})`;
}

export default function TraderCard({
  id,
  name,
  riskTolerance,
  cumulativeReturn,
  dailyReturn,
  mood,
  runCount,
}: Props) {
  const isPos = cumulativeReturn >= 0;
  const isDailyPos = dailyReturn >= 0;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const riskColor: Record<string, string> = {
    low: "#22c55e",
    medium: "#f59e0b",
    high: "#ef4444",
    reckless: "#c8f542",
  };

  return (
    <Link
      href={`/traders/${id}`}
      style={{ textDecoration: "none" }}
    >
      <div
        style={{
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 8,
          padding: "16px",
          cursor: "pointer",
          transition: "border-color 0.15s",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#c8f542";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#27272a";
        }}
      >
        {/* Bottom shimmer */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(90deg, transparent, #a5cc30, transparent)",
            opacity: 0.3,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {/* Avatar */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: nameToColor(name),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "#0a0a0b",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#fafafa",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name}
            </div>
            <div style={{ fontSize: 10, color: "#71717a" }}>
              {MOOD_EMOJI[mood] ?? "⚪"} {mood}
            </div>
          </div>
        </div>

        {/* Returns */}
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                color: "#71717a",
                marginBottom: 2,
              }}
            >
              Total
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: -0.5,
                color: isPos ? "#22c55e" : "#ef4444",
              }}
            >
              {isPos ? "+" : ""}
              {(cumulativeReturn * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                color: "#71717a",
                marginBottom: 2,
              }}
            >
              Today
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: -0.5,
                color: isDailyPos ? "#22c55e" : "#ef4444",
              }}
            >
              {isDailyPos ? "+" : ""}
              {(dailyReturn * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              background: "#1e1e22",
              border: "1px solid #27272a",
              padding: "2px 8px",
              borderRadius: 3,
              fontSize: 10,
              color: riskColor[riskTolerance] ?? "#a1a1aa",
            }}
          >
            {riskTolerance}
          </span>
          {runCount > 0 && (
            <span
              style={{
                background: "#1e1e22",
                border: "1px solid #27272a",
                padding: "2px 8px",
                borderRadius: 3,
                fontSize: 10,
                color: "#a1a1aa",
              }}
            >
              {runCount}d
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
