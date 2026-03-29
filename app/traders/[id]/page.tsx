import PersonaBadge from "@/components/PersonaBadge";
import DailyReview from "@/components/DailyReview";
import TradeLog from "@/components/TradeLog";
import EquityCurve from "@/components/EquityCurve";
import BeliefTable from "@/components/BeliefTable";
import StrategyView from "@/components/StrategyView";

interface Props {
  params: Promise<{ id: string }>;
}

function parseIdentityMd(content: string, fallbackName: string) {
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
    description: philoMatch ? philoMatch[1].trim() : "",
  };
}

async function getTraderData(id: number) {
  const { SimDB } = await import("@/lib/db/repository");
  const { getFileStore } = await import("@/lib/fileStore");
  const db = new SimDB();
  const fileStore = getFileStore();

  const agent = await db.getAgent(id);
  if (!agent) return null;

  const { FMPClient } = await import("@/lib/fmp");
  const fmp = new FMPClient();

  const [state, snapshots, trades, positions] = await Promise.all([
    db.getAgentState(id),
    db.getSnapshots(id),
    db.getTrades(id, 200),
    db.getPositions(id),
  ]);

  // Fetch current market prices for open positions
  const posTickers = positions.map((p) => p.ticker);
  const quotes = posTickers.length > 0 ? await fmp.getBatchQuotes(posTickers) : {};

  let persona = parseIdentityMd("", agent.name);
  let review: { date: string; review_text: string; mood: string | null; dailyReturn?: number | null } | null = null;
  let beliefs: Record<string, import("@/lib/fileStore").TickerBelief> = {};
  let strategyMd = "";

  try {
    const [identityContent, loadedBeliefs, loadedStrategy] = await Promise.all([
      fileStore.loadIdentity(id),
      fileStore.loadBeliefs(id),
      fileStore.loadStrategy(id),
    ]);
    persona = parseIdentityMd(identityContent, agent.name);
    beliefs = loadedBeliefs;
    strategyMd = loadedStrategy;

    const dates = await fileStore.listJournalDates(id);
    if (dates.length > 0) {
      const lastDate = dates[dates.length - 1];
      const content = await fileStore.readJournal(id, lastDate);
      if (content) {
        const moodMatch = content.match(/## Mood:\s*(\w+)/i);
        const summaryMatch = content.match(
          /## (?:Summary|Reflection|Thoughts)[^\n]*\n([\s\S]+?)(?=\n##|$)/i
        );
        // Find the snapshot for the journal date to get daily return
        const journalSnap = snapshots.find((s) => s.date === lastDate);
        review = {
          date: lastDate,
          mood: moodMatch?.[1] ?? "neutral",
          review_text: summaryMatch?.[1].trim() ?? content.substring(0, 300),
          dailyReturn: journalSnap?.daily_return ?? null,
        };
      }
    }
  } catch {}

  // Enrich SELL trades with entry price and P/L
  // Trades are DESC (latest first). Reverse to ASC for correct BUY lookup.
  const tradesAsc = [...trades].reverse();
  const enrichedTrades = trades.map((t: any) => {
    if (t.side === "SELL") {
      // findLast on ASC array = most recent BUY before this SELL
      const matchingBuy = tradesAsc.findLast(
        (b: any) => b.side === "BUY" && b.ticker === t.ticker && b.date <= t.date
      );
      const entryPrice = matchingBuy?.price ?? null;
      const tradePnl = entryPrice ? (t.price - entryPrice) / entryPrice : null;
      return { ...t, entryPrice, tradePnl };
    }
    return { ...t, entryPrice: null, tradePnl: null };
  });

  return { agent, persona, state, review, snapshots, trades: enrichedTrades, positions, beliefs, strategyMd, quotes };
}

function TradeReasonBreakdown({ trades }: { trades: any[] }) {
  const groups: Record<string, { count: number; buys: number; sells: number; pnls: number[] }> = {};
  for (const t of trades) {
    const reason = t.reason ?? "UNKNOWN";
    if (!groups[reason]) groups[reason] = { count: 0, buys: 0, sells: 0, pnls: [] };
    groups[reason].count++;
    if (t.side === "BUY") groups[reason].buys++;
    else {
      groups[reason].sells++;
      if (t.tradePnl != null) groups[reason].pnls.push(t.tradePnl);
    }
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1].count - a[1].count);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 12,
        padding: "8px 0",
      }}
    >
      {sorted.map(([reason, stats]) => {
        const color =
          reason === "STOP_LOSS" ? "#ef4444" :
          reason.includes("OVERRIDE") ? "#f59e0b" :
          reason.includes("ALERT") ? "#a78bfa" :
          "#52525b";
        const avgPnl = stats.pnls.length > 0
          ? stats.pnls.reduce((a, b) => a + b, 0) / stats.pnls.length
          : null;
        return (
          <div
            key={reason}
            style={{
              background: "#111113",
              border: "1px solid #27272a",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 11,
              color: "#a1a1aa",
            }}
          >
            <span style={{ color, fontWeight: 500 }}>{reason}</span>
            {" "}{stats.count} ({stats.buys}B / {stats.sells}S)
            {avgPnl != null && (
              <span style={{ marginLeft: 6, color: avgPnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 500 }}>
                avg {avgPnl >= 0 ? "+" : ""}{(avgPnl * 100).toFixed(1)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function computeRiskMetrics(snapshots: any[]) {
  if (snapshots.length < 2) return { sharpe: null, maxDrawdown: 0, winRate: null };

  const returns: number[] = [];
  let peak = snapshots[0].portfolio_value;
  let maxDrawdown = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const r = snapshots[i].daily_return ?? 0;
    returns.push(r);
    const val = snapshots[i].portfolio_value;
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio (annualized, risk-free = 0)
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : null;

  return { sharpe, maxDrawdown };
}

function computeWinRate(trades: any[]) {
  // Use enriched tradePnl from sell trades
  const sells = trades.filter((t: any) => t.side === "SELL" && t.tradePnl != null);
  if (sells.length === 0) return null;
  const wins = sells.filter((t: any) => t.tradePnl >= 0).length;
  return wins / sells.length;
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

  const { agent, persona, state, review, snapshots, trades, positions, beliefs, strategyMd, quotes } = data;
  const snap = snapshots[snapshots.length - 1];
  const portfolioValue = snap?.portfolio_value ?? agent.initial_cash;
  const totalReturn = snap?.cumulative_return ?? 0;
  const dailyReturn = snap?.daily_return ?? 0;
  const isPos = totalReturn >= 0;
  const isDailyPos = dailyReturn >= 0;
  const riskMetrics = computeRiskMetrics(snapshots);
  const winRate = computeWinRate(trades);

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
        <KPI
          label="Sharpe Ratio"
          value={riskMetrics.sharpe != null ? riskMetrics.sharpe.toFixed(2) : "—"}
          color={riskMetrics.sharpe != null ? (riskMetrics.sharpe >= 1 ? "#22c55e" : riskMetrics.sharpe >= 0 ? "#f59e0b" : "#ef4444") : undefined}
        />
        <KPI
          label="Max Drawdown"
          value={`-${(riskMetrics.maxDrawdown * 100).toFixed(1)}%`}
          color={riskMetrics.maxDrawdown > 0.2 ? "#ef4444" : riskMetrics.maxDrawdown > 0.1 ? "#f59e0b" : "#22c55e"}
        />
        <KPI
          label="Win Rate"
          value={winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
          color={winRate != null ? (winRate >= 0.5 ? "#22c55e" : "#ef4444") : undefined}
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
        {/* Left: persona + review + strategy */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PersonaBadge persona={persona} />
          <DailyReview review={review} />
          {strategyMd && <StrategyView strategy={strategyMd} />}
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
                      {["Ticker", "Shares", "Entry", "Current", "Trail High", "Mkt Value", "% Port", "P/L %", "Days", "Entry Date"].map((h) => (
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
                    {positions.map((p) => {
                      const currentPrice = quotes[p.ticker]?.price ?? p.entry_price;
                      const mktValue = currentPrice * p.shares;
                      const plPct = (currentPrice - p.entry_price) / p.entry_price;
                      const plColor = plPct >= 0 ? "#22c55e" : "#ef4444";
                      const portPct = portfolioValue > 0 ? (mktValue / portfolioValue) * 100 : 0;
                      const trailHigh = p.trailing_high ?? currentPrice;
                      const daysHeld = Math.max(1, Math.round((Date.now() - new Date(p.entry_date).getTime()) / (1000 * 60 * 60 * 24)));
                      const drawdownFromHigh = trailHigh > 0 ? ((trailHigh - currentPrice) / trailHigh) * 100 : 0;
                      const td = { padding: "8px 12px", borderBottom: "1px solid #1c1c1f", fontSize: 12, color: "#a1a1aa" } as const;
                      return (
                        <tr key={p.ticker}>
                          <td style={{ ...td, color: "#fafafa", fontWeight: 500 }}>
                            {p.ticker}
                          </td>
                          <td style={td}>{p.shares}</td>
                          <td style={td}>${p.entry_price.toFixed(2)}</td>
                          <td style={td}>${currentPrice.toFixed(2)}</td>
                          <td style={{ ...td, color: drawdownFromHigh > 15 ? "#ef4444" : drawdownFromHigh > 5 ? "#f59e0b" : "#a1a1aa" }}>
                            ${trailHigh.toFixed(2)}
                          </td>
                          <td style={td}>
                            ${mktValue.toLocaleString("en", { maximumFractionDigits: 0 })}
                          </td>
                          <td style={{ ...td, color: portPct > 30 ? "#f59e0b" : "#a1a1aa" }}>
                            {portPct.toFixed(1)}%
                          </td>
                          <td style={{ ...td, color: plColor, fontWeight: 500 }}>
                            {plPct >= 0 ? "+" : ""}{(plPct * 100).toFixed(2)}%
                          </td>
                          <td style={td}>{daysHeld}d</td>
                          <td style={td}>{p.entry_date}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Beliefs */}
      {Object.keys(beliefs).length > 0 && (
        <>
          {sectionTitle("Ticker Beliefs")}
          <div style={{ marginBottom: 32 }}>
            <BeliefTable beliefs={beliefs} />
          </div>
        </>
      )}

      {/* Trade reason breakdown */}
      {trades.length > 0 && (
        <>
          {sectionTitle("Trade History")}
          <TradeReasonBreakdown trades={trades} />
        </>
      )}
      <TradeLog trades={trades} />
    </div>
  );
}
