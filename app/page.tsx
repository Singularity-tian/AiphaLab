"use client";

import { useState } from "react";
import { DaemonStatus } from "@/components/DaemonStatus";
import { MarketOverview } from "@/components/MarketOverview";
import { CreateTraderSheet } from "@/components/CreateTraderSheet";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import Leaderboard from "@/components/Leaderboard";
import TraderCard from "@/components/TraderCard";

const sectionTitle = (text: string) => (
  <div
    style={{
      fontFamily: '"Instrument Serif", serif',
      fontSize: 22,
      fontWeight: 400,
      marginBottom: 20,
      paddingBottom: 12,
      borderBottom: "1px solid #27272a",
      display: "flex",
      alignItems: "center",
      gap: 10,
    }}
  >
    <div style={{ width: 6, height: 6, background: "#c8f542", borderRadius: "50%", flexShrink: 0 }} />
    {text}
  </div>
);

export default function DashboardPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { leaderboard, refetch } = useLeaderboard(60_000);

  const topAgents = leaderboard.slice(0, 12);

  const handleTraderCreated = (agentId: number) => {
    setSheetOpen(false);
    refetch();
  };

  return (
    <>
      <div>
        {/* Header */}
        <header
          style={{
            paddingBottom: 40,
            borderBottom: "1px solid #27272a",
            marginBottom: 48,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -32,
              left: 0,
              right: 0,
              height: 1,
              background: "linear-gradient(90deg, transparent, #c8f542, transparent)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1
                style={{
                  fontFamily: '"Instrument Serif", serif',
                  fontSize: 42,
                  fontWeight: 400,
                  letterSpacing: -1,
                  marginBottom: 8,
                }}
              >
                Aipha<span style={{ color: "#c8f542", fontStyle: "italic" }}>Lab</span>
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
                <MarketOverview />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <DaemonStatus />
              <button
                onClick={() => setSheetOpen(true)}
                style={{
                  background: "#c8f542",
                  color: "#0a0a0b",
                  border: "none",
                  padding: "7px 16px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontFamily: '"DM Mono", monospace',
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                + New Trader
              </button>
            </div>
          </div>
        </header>

        {/* Two-column layout: leaderboard + cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 32, alignItems: "start" }}>
          {/* Leaderboard */}
          <div>
            {sectionTitle("Rankings")}
            <Leaderboard data={leaderboard.slice(0, 20)} />
          </div>

          {/* Top trader cards */}
          <div>
            {sectionTitle("Top Performers")}
            {topAgents.length === 0 ? (
              <div
                style={{
                  background: "#111113",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  padding: 48,
                  textAlign: "center",
                  color: "#71717a",
                  fontSize: 13,
                }}
              >
                <div style={{ marginBottom: 12 }}>No simulation data yet.</div>
                <div style={{ color: "#a1a1aa", fontSize: 12 }}>
                  Click{" "}
                  <button
                    onClick={() => setSheetOpen(true)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#c8f542",
                      fontFamily: '"DM Mono", monospace',
                      fontSize: 12,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    + New Trader
                  </button>{" "}
                  or run{" "}
                  <code style={{ background: "#1e1e22", color: "#c8f542", padding: "2px 6px", borderRadius: 3 }}>
                    pnpm seed -- --n 5
                  </code>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {topAgents.map((a) => (
                  <TraderCard
                    key={a.id}
                    id={a.id}
                    name={a.name}
                    strategy={a.strategy}
                    riskTolerance="medium"
                    cumulativeReturn={a.cumulativeReturn}
                    dailyReturn={a.dailyReturn}
                    mood="neutral"
                    runCount={0}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateTraderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={handleTraderCreated}
      />
    </>
  );
}
