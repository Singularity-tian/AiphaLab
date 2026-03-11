import Leaderboard from "@/components/Leaderboard";
import TraderCard from "@/components/TraderCard";

async function getLeaderboard() {
  try {
    const { SimDB } = await import("@/lib/db/repository");
    const db = new SimDB();
    return db.getLeaderboard(100);
  } catch {
    return [];
  }
}

async function getAgents() {
  try {
    const { SimDB } = await import("@/lib/db/repository");
    const db = new SimDB();
    const agents = db.getAllAgents();
    return agents.map((a) => {
      const persona = JSON.parse(a.persona_json);
      const state = db.getAgentState(a.id);
      const review = db.getLatestReview(a.id);
      const snap = db.getLatestSnapshot(a.id);
      return {
        id: a.id,
        name: a.name,
        strategy: a.strategy_name,
        riskTolerance: persona.riskTolerance ?? "medium",
        personalityTraits: persona.personalityTraits ?? [],
        portfolioValue: snap?.portfolio_value ?? a.initial_cash,
        cumulativeReturn: snap?.cumulative_return ?? 0,
        dailyReturn: snap?.daily_return ?? 0,
        mood: review?.mood ?? "neutral",
        runCount: state?.run_count ?? 0,
      };
    });
  } catch {
    return [];
  }
}

async function getSimStatus() {
  try {
    const { SimDB } = await import("@/lib/db/repository");
    const db = new SimDB();
    const last = db.getLastSimLog();
    const agentCount = db.getAllAgents().length;
    return { lastRunDate: last?.date ?? null, agentCount };
  } catch {
    return { lastRunDate: null, agentCount: 0 };
  }
}

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
    <div
      style={{
        width: 6,
        height: 6,
        background: "#c8f542",
        borderRadius: "50%",
        flexShrink: 0,
      }}
    />
    {text}
  </div>
);

export default async function DashboardPage() {
  const [lb, agents, status] = await Promise.all([getLeaderboard(), getAgents(), getSimStatus()]);

  // Map leaderboard to expected shape
  const lbData = lb.map((r: any, i: number) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    strategy: r.strategy_name,
    portfolioValue: r.portfolio_value,
    cumulativeReturn: r.cumulative_return ?? 0,
    dailyReturn: r.daily_return ?? 0,
    tradeCount: r.trade_count ?? 0,
  }));

  const topAgents = agents
    .sort((a, b) => b.cumulativeReturn - a.cumulativeReturn)
    .slice(0, 12);

  return (
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
            <p style={{ color: "#71717a", fontSize: 14 }}>
              100 LLM-powered traders · real market data · daily simulation
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div
              style={{
                background: "#18181b",
                border: "1px solid #27272a",
                padding: "5px 12px",
                borderRadius: 4,
                fontSize: 11,
                color: "#a1a1aa",
              }}
            >
              <b style={{ color: "#fafafa" }}>{status.agentCount}</b> traders
            </div>
            {status.lastRunDate && (
              <div
                style={{
                  background: "#18181b",
                  border: "1px solid #27272a",
                  padding: "5px 12px",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#a1a1aa",
                }}
              >
                Last run: <b style={{ color: "#fafafa" }}>{status.lastRunDate}</b>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Two-column layout: leaderboard + cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        {/* Leaderboard */}
        <div>
          {sectionTitle("Rankings")}
          <Leaderboard data={lbData.slice(0, 20)} />
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
                Run{" "}
                <code
                  style={{
                    background: "#1e1e22",
                    color: "#c8f542",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  tsx scripts/seed.ts --n 5
                </code>{" "}
                then{" "}
                <code
                  style={{
                    background: "#1e1e22",
                    color: "#c8f542",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  tsx scripts/run.ts
                </code>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {topAgents.map((a) => (
                <TraderCard key={a.id} {...a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
