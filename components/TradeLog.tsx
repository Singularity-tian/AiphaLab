"use client";

import { Fragment, useState } from "react";

interface Trade {
  id: number;
  date: string;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  value: number;
  commission: number;
  reason: string;
  llm_rationale: string | null;
  signal_score: number | null;
  phase: string;
  entryPrice: number | null;
  tradePnl: number | null;
}

interface Props {
  trades: Trade[];
}

export default function TradeLog({ trades }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE = 20;
  const paged = trades.slice(page * PAGE, (page + 1) * PAGE);

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
          Trade History
        </span>
        <span style={{ fontSize: 11, color: "#71717a" }}>{trades.length} trades</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Ticker", "Side", "Shares", "Price", "Value", "P/L", "Signal", "Phase", "Reason"].map((h) => (
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
            {paged.map((t) => (
              <Fragment key={t.id}>
                <tr
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  style={{ cursor: t.llm_rationale ? "pointer" : "default" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#18181b";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td style={tdStyle}>{t.date}</td>
                  <td style={{ ...tdStyle, color: "#fafafa", fontWeight: 500 }}>{t.ticker}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: t.side === "BUY" ? "#22c55e" : "#ef4444",
                      fontWeight: 500,
                    }}
                  >
                    {t.side}
                  </td>
                  <td style={tdStyle}>{t.shares}</td>
                  <td style={tdStyle}>${t.price.toFixed(2)}</td>
                  <td style={tdStyle}>${t.value.toLocaleString("en", { maximumFractionDigits: 0 })}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: t.tradePnl != null
                        ? t.tradePnl >= 0 ? "#22c55e" : "#ef4444"
                        : "#3f3f46",
                      fontWeight: t.tradePnl != null ? 500 : 400,
                    }}
                  >
                    {t.side === "SELL" && t.tradePnl != null
                      ? `${t.tradePnl >= 0 ? "+" : ""}${(t.tradePnl * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: t.signal_score == null
                        ? "#3f3f46"
                        : t.signal_score >= 0.7
                        ? "#22c55e"
                        : t.signal_score >= 0.4
                        ? "#f59e0b"
                        : "#ef4444",
                      fontWeight: 500,
                    }}
                  >
                    {t.signal_score != null ? t.signal_score.toFixed(2) : "—"}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10, color: "#52525b" }}>
                    {t.phase}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color:
                        t.reason === "STOP_LOSS"
                          ? "#ef4444"
                          : t.reason === "LLM_OVERRIDE"
                          ? "#f59e0b"
                          : "#71717a",
                      fontSize: 11,
                    }}
                  >
                    {t.reason}
                    {t.llm_rationale && (
                      <span style={{ marginLeft: 6, color: "#27272a" }}>
                        {expanded === t.id ? "▲" : "▼"}
                      </span>
                    )}
                  </td>
                </tr>
                {expanded === t.id && t.llm_rationale && (
                  <tr key={`${t.id}-rationale`}>
                    <td
                      colSpan={10}
                      style={{
                        padding: "8px 16px 12px",
                        background: "#1e1e22",
                        fontSize: 12,
                        color: "#a1a1aa",
                        fontStyle: "italic",
                        borderBottom: "1px solid #1c1c1f",
                      }}
                    >
                      "{t.llm_rationale}"
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {trades.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{ padding: "24px 16px", textAlign: "center", color: "#71717a", fontSize: 12 }}
                >
                  No trades yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {trades.length > PAGE && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #27272a",
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 11,
            color: "#71717a",
          }}
        >
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            style={btnStyle}
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} / {Math.ceil(trades.length / PAGE)}
          </span>
          <button
            onClick={() => setPage(Math.min(Math.ceil(trades.length / PAGE) - 1, page + 1))}
            disabled={(page + 1) * PAGE >= trades.length}
            style={btnStyle}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #1c1c1f",
  fontSize: 12,
  color: "#a1a1aa",
  whiteSpace: "nowrap",
};

const btnStyle: React.CSSProperties = {
  background: "#18181b",
  border: "1px solid #27272a",
  color: "#a1a1aa",
  padding: "4px 10px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
  fontFamily: '"DM Mono", monospace',
};
