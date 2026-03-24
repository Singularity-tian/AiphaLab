import TraderCard from "@/components/TraderCard";

export const dynamic = "force-dynamic";

async function getAgents() {
  try {
    const { SimDB } = await import("@/lib/db/repository");
    const { getFileStore } = await import("@/lib/fileStore");
    const db = new SimDB();
    const fileStore = getFileStore();
    const agents = await db.getAllAgents();

    const results = await Promise.all(
      agents.map(async (a) => {
        const [state, snap] = await Promise.all([
          db.getAgentState(a.id),
          db.getLatestSnapshot(a.id),
        ]);

        let riskTolerance = "medium";
        let mood = "neutral";
        try {
          const identity = await fileStore.loadIdentity(a.id);
          const riskMatch = identity.match(/Risk tolerance:\s*(\w+)/i);
          if (riskMatch) riskTolerance = riskMatch[1];

          const dates = await fileStore.listJournalDates(a.id);
          if (dates.length > 0) {
            const journal = await fileStore.readJournal(a.id, dates[dates.length - 1]);
            const moodMatch = journal?.match(/## Mood:\s*(\w+)/i);
            if (moodMatch) mood = moodMatch[1];
          }
        } catch {}

        return {
          id: a.id,
          name: a.name,
          riskTolerance,
          cumulativeReturn: snap?.cumulative_return ?? 0,
          dailyReturn: snap?.daily_return ?? 0,
          mood,
          runCount: state?.run_count ?? 0,
        };
      })
    );

    return results.sort((a, b) => b.cumulativeReturn - a.cumulativeReturn);
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
