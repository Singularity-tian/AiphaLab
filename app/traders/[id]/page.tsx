import PersonaBadge from "@/components/PersonaBadge";
import DailyReview from "@/components/DailyReview";
import TradeLog from "@/components/TradeLog";
import EquityCurve from "@/components/EquityCurve";

interface Props {
  params: Promise<{ id: string }>;
}

function parseIdentityMd(content: string, fallbackName: string, fallbackStrategy: string) {
  const nameLineMatch = content.match(/^#\s+(.+?)\s+—\s+(.+)$/m);
  const bgMatch = content.match(/## Background\n([\s\S]+?)(?=\n##)/);
  const traitsMatch = content.match(/## Personality\n([\s\S]+?)(?=\n##)/);
  const philoMatch = content.match(/## Trading Philosophy\n([\s\S]+?)(?=\n##)/);
  const quirksMatch = content.match(/## Quirks\n([\s\S]+?)(?=\n##)/);
  const riskMatch = content.match(/Risk tolerance:\s*(\w+)/i);

  const listItems = (block: string) =>
    block.match(/^-\s+(.+)$/gm)?.map((l) => l.replace(/^-\s+/, "")) ?? [];

  return {
    name: fallbackName,
    age: 35,
    background: bgMatch ? bgMatch[1].trim() : "",
    personalityTraits: traitsMatch ? listItems(traitsMatch[1]) : [],
    riskTolerance: riskMatch ? riskMatch[1] : "medium",
    tradingStyle: nameLineMatch ? nameLineMatch[2].trim() : "signal-based",
    quirks: quirksMatch ? listItems(quirksMatch[1]) : [],
    preferredStrategy: fallbackStrategy,
    description: philoMatch ? philoMatch[1].trim() : "",
  };
}

async function getTraderData(id: number) {
  const { SimDB } = await import("@/lib/db/repository");
  const { FileStore } = await import("@/lib/fileStore");
  const db = new SimDB();
  const fileStore = new FileStore();

  const agent = await db.getAgent(id);
  if (!agent) return null;

  const [state, snapshots, trades, positions] = await Promise.all([
    db.getAgentState(id),
    db.getSnapshots(id),
    db.getTrades(id, 200),
    db.getPositions(id),
  ]);

  let persona = parseIdentityMd("", agent.name, agent.strategy_name);
  let review: { date: string; review_text: string; mood: string | null } | null = null;

  try {
    const identityContent = await fileStore.loadIdentity(id);
    persona = parseIdentityMd(identityContent, agent.name, agent.strategy_name);

    const dates = await fileStore.listJournalDates(id);
    if (dates.length > 0) {
      const lastDate = dates[dates.length - 1];
      const content = await fileStore.readJournal(id, lastDate);
      if (content) {
        const moodMatch = content.match(/## Mood:\s*(\w+)/i);
        const summaryMatch = content.match(
          /## (?:Summary|Reflection|Thoughts)[^\n]*\n([\s\S]+?)(?=\n##|$)/i
        );
        review = {
          date: lastDate,
          mood: moodMatch?.[1] ?? "neutral",
          review_text: summaryMatch?.[1].trim() ?? content.substring(0, 300),
        };
      }
    }
  } catch {}

  return { agent, persona, state, review, snapshots, trades, positions };
}

const KPI = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div
    style={{
      background: "#111113",
      padding: "20px 24px",
    }}
  >
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "1.5px",
        color: "#71717a",
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: -0.5,
        color: color ?? "#fafafa",
      }}
    >
      {value}
    </div>
  </div>
);

export default async function TraderProfilePage({ params }: Props) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  const data = await getTraderData(id).catch(() => null);

  if (!data) {
    return (
      <div style={{ color: "#71717a", padding: 32 }}>Trader not found.</div>
    );
  }

  const { agent, persona, state, review, snapshots, trades, positions } = data;
  const snap = snapshots[snapshots.length - 1];
  const portfolioValue = snap?.portfolio_value ?? agent.initial_cash;
  const totalReturn = snap?.cumulative_return ?? 0;
  const dailyReturn = snap?.daily_return ?? 0;
  const isPos = totalReturn >= 0;
  const isDailyPos = dailyReturn >= 0;

  const sectionTitle = (text: string) => (
    <div
      style={{
        fontFamily: '"Instrument Serif", serif',
        fontSize: 20,
        fontWeight: 400,
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: "1px solid #27272a",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 5,
          height: 5,
          background: "#c8f542",
          borderRadius: "50%",
        }}
      />
      {text}
    </div>
  );

  return (
    <div>
      {/* Back link */}
      <a
        href="/traders"
        style={{
          fontSize: 11,
          color: "#71717a",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 24,
        }}
      >
        ← All Traders
      </a>

      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 1,
          background: "#1c1c1f",
          border: "1px solid #27272a",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <KPI
          label="Portfolio"
          value={`$${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })}`}
        />
        <KPI
          label="Total Return"
          value={`${isPos ? "+" : ""}${(totalReturn * 100).toFixed(2)}%`}
          color={isPos ? "#22c55e" : "#ef4444"}
        />
        <KPI
          label="Today"
          value={`${isDailyPos ? "+" : ""}${(dailyReturn * 100).toFixed(2)}%`}
          color={isDailyPos ? "#22c55e" : "#ef4444"}
        />
        <KPI
          label="Positions"
          value={String(positions.length)}
          color="#c8f542"
        />
        <KPI
          label="Days Traded"
          value={String(state?.run_count ?? 0)}
        />
        <KPI
          label="Total Trades"
          value={String(trades.length)}
        />
      </div>

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Left: persona + review */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PersonaBadge persona={persona} />
          <DailyReview review={review} />
        </div>

        {/* Right: equity curve + positions */}
        <div>
          {sectionTitle("Equity Curve")}
          <div
            style={{
              background: "#111113",
              border: "1px solid #27272a",
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
              position: "relative",
              overflow: "hidden",
            }}
          >
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
            <EquityCurve
              data={snapshots.map((s) => ({
                date: s.date,
                portfolio_value: s.portfolio_value,
                daily_return: s.daily_return ?? 0,
                cumulative_return: s.cumulative_return ?? 0,
              }))}
              initialCash={agent.initial_cash}
            />
          </div>

          {positions.length > 0 && (
            <>
              {sectionTitle("Open Positions")}
              <div
                style={{
                  background: "#111113",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 24,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Ticker", "Shares", "Entry Price", "Entry Date"].map((h) => (
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
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.ticker}>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid #1c1c1f", fontSize: 12, color: "#fafafa", fontWeight: 500 }}>
                          {p.ticker}
                        </td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid #1c1c1f", fontSize: 12, color: "#a1a1aa" }}>
                          {p.shares}
                        </td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid #1c1c1f", fontSize: 12, color: "#a1a1aa" }}>
                          ${p.entry_price.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px 16px", borderBottom: "1px solid #1c1c1f", fontSize: 12, color: "#a1a1aa" }}>
                          {p.entry_date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Trade log */}
      {sectionTitle("Trade History")}
      <TradeLog trades={trades} />
    </div>
  );
}
