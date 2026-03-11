import TraderCard from "@/components/TraderCard";

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
        cumulativeReturn: snap?.cumulative_return ?? 0,
        dailyReturn: snap?.daily_return ?? 0,
        mood: review?.mood ?? "neutral",
        runCount: state?.run_count ?? 0,
      };
    }).sort((a, b) => b.cumulativeReturn - a.cumulativeReturn);
  } catch {
    return [];
  }
}

export default async function TradersPage() {
  const agents = await getAgents();

  return (
    <div>
      <header style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: -0.5,
            marginBottom: 8,
          }}
        >
          All Traders
        </h1>
        <p style={{ color: "#71717a", fontSize: 13 }}>
          {agents.length} traders active
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {agents.map((a) => (
          <TraderCard key={a.id} {...a} />
        ))}
      </div>
    </div>
  );
}
