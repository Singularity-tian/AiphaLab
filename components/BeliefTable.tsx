"use client";

import { Fragment, useState } from "react";

interface TickerBelief {
  thesis: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  lastTrade: {
    side: "BUY" | "SELL";
    date: string;
    price: number;
    outcome: "profit" | "loss" | null;
    pnl: number | null;
  } | null;
  winCount: number;
  lossCount: number;
  notes: string;
  updatedAt: string;
}

interface Props {
  beliefs: Record<string, TickerBelief>;
}

const sentimentColor: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#71717a",
};

export default function BeliefTable({ beliefs }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = Object.entries(beliefs).sort(
    (a, b) => b[1].confidence - a[1].confidence
  );

  if (entries.length === 0) {
    return (
      <div
        style={{
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 8,
          padding: "24px 16px",
          textAlign: "center",
          color: "#71717a",
          fontSize: 12,
        }}
      >
        No beliefs yet
      </div>
    );
  }

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
        <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 16 }}>
          Beliefs
        </span>
        <span style={{ fontSize: 11, color: "#71717a" }}>
          {entries.length} tickers
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Ticker", "Sentiment", "Confidence", "W/L", "Last Trade"].map(
                (h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map(([ticker, b]) => (
              <Fragment key={ticker}>
                <tr
                  onClick={() =>
                    setExpanded(expanded === ticker ? null : ticker)
                  }
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "#18181b";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      color: "#fafafa",
                      fontWeight: 500,
                    }}
                  >
                    {ticker}
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: sentimentColor[b.sentiment] ?? "#71717a",
                        fontWeight: 500,
                      }}
                    >
                      {b.sentiment}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 4,
                          background: "#1e1e22",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.round(b.confidence * 100)}%`,
                            height: "100%",
                            background: "#c8f542",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: "#a1a1aa" }}>
                        {(b.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#22c55e" }}>{b.winCount}W</span>
                    <span style={{ color: "#71717a", margin: "0 3px" }}>/</span>
                    <span style={{ color: "#ef4444" }}>{b.lossCount}L</span>
                  </td>
                  <td style={tdStyle}>
                    {b.lastTrade ? (
                      <span>
                        <span
                          style={{
                            color:
                              b.lastTrade.side === "BUY"
                                ? "#22c55e"
                                : "#ef4444",
                            fontWeight: 500,
                          }}
                        >
                          {b.lastTrade.side}
                        </span>
                        <span style={{ color: "#71717a", marginLeft: 6 }}>
                          {b.lastTrade.date}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "#3f3f46" }}>—</span>
                    )}
                  </td>
                </tr>
                {expanded === ticker && (
                  <tr key={`${ticker}-detail`}>
                    <td
                      colSpan={5}
                      style={{
                        padding: "10px 16px 14px",
                        background: "#1e1e22",
                        borderBottom: "1px solid #1c1c1f",
                      }}
                    >
                      {b.thesis && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#a1a1aa",
                            marginBottom: b.notes ? 8 : 0,
                            fontStyle: "italic",
                          }}
                        >
                          &ldquo;{b.thesis}&rdquo;
                        </div>
                      )}
                      {b.notes && (
                        <div style={{ fontSize: 11, color: "#71717a" }}>
                          {b.notes}
                        </div>
                      )}
                      {!b.thesis && !b.notes && (
                        <div style={{ fontSize: 11, color: "#3f3f46" }}>
                          No notes
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
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
};

const tdStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #1c1c1f",
  fontSize: 12,
  color: "#a1a1aa",
  whiteSpace: "nowrap",
};
