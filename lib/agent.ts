/**
 * TraderAgent — runs one trader's daily cycle.
 */

import { z } from "zod";
import { SimDB } from "./db/repository";
import { SimulatedBroker } from "./broker";
import { FMPClient } from "./fmp";
import { computeBatchSignals, SignalResult } from "./signals";
import { generateStructuredWithRetry } from "./llm";
import { addMemory, searchMemory } from "./mem0";
import { TraderPersona } from "./persona";

// ---- Schemas ----

const TradingDecisionSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  ticker: z.string().optional(),
  conviction: z.number().min(0).max(1),
  dollarAmount: z.number().optional(),
  rationale: z.string(),
  overridingSignal: z.boolean(),
});
type TradingDecision = z.infer<typeof TradingDecisionSchema>;

const DayReviewSchema = z.object({
  mood: z.enum(["bullish", "cautious", "frustrated", "confident", "anxious", "neutral", "euphoric", "depressed"]),
  keyInsight: z.string(),
  fullReview: z.string(),
});
type DayReview = z.infer<typeof DayReviewSchema>;

export interface MarketContext {
  date: string;
  spyReturn1d: number;
  spyReturn5d: number;
  vixLevel: number | null;
  marketRegime: "trending_up" | "trending_down" | "choppy";
}

export interface DayResult {
  agentId: number;
  name: string;
  date: string;
  tradesExecuted: number;
  portfolioValue: number;
  cumulativeReturn: number;
  mood: string;
}

// ---- TraderAgent ----

export class TraderAgent {
  private agentId: number;
  private persona: TraderPersona;
  private strategy: string;
  private initialCash: number;
  private db: SimDB;
  private fmp: FMPClient;

  constructor(
    agentId: number,
    persona: TraderPersona,
    strategy: string,
    initialCash: number,
    db: SimDB,
    fmp: FMPClient
  ) {
    this.agentId = agentId;
    this.persona = persona;
    this.strategy = strategy;
    this.initialCash = initialCash;
    this.db = db;
    this.fmp = fmp;
  }

  async runDay(marketContext: MarketContext): Promise<DayResult> {
    const { date } = marketContext;

    // 1. Reconstruct broker from DB
    const broker = SimulatedBroker.fromDB(this.agentId, this.db);

    // 2. Check stop-losses first
    await broker.checkStopLosses(date, this.fmp);

    // 3. Compute signals for watchlist
    const signals = await computeBatchSignals(
      this.persona.watchlist,
      date,
      this.fmp,
      this.strategy === "momentum" ? "momentum" : "graham_value"
    );

    // 4. Get relevant memories
    const currentTickers = Array.from(broker.positions.keys());
    const memoryQuery = `Recent trading decisions, market observations, and stock opinions ${currentTickers.length > 0 ? "about " + currentTickers.slice(0, 3).join(", ") : ""}`;
    const memories = await searchMemory(this.agentId, memoryQuery);

    // 5. Build decision prompt
    const prompt = this._buildDecisionPrompt(signals, broker, memories, marketContext);

    // 6. Get LLM trading decision
    let decision: TradingDecision;
    try {
      decision = await generateStructuredWithRetry(
        prompt,
        TradingDecisionSchema,
        this.persona.decisionTemperature
      );
    } catch {
      decision = { action: "HOLD", conviction: 0.5, rationale: "Unable to decide today.", overridingSignal: false };
    }

    // 7. Execute trade
    let tradesExecuted = 0;
    if (decision.action === "BUY" && decision.ticker) {
      const maxCash = broker.cash * 0.9;
      const rawAmount = decision.dollarAmount ?? maxCash * 0.25;
      const adjustedAmount = rawAmount * this.persona.convictionMultiplier;
      const finalAmount = Math.min(adjustedAmount, maxCash * 0.4);

      const result = await broker.buy(
        decision.ticker,
        finalAmount,
        date,
        this.fmp,
        decision.overridingSignal ? "LLM_OVERRIDE" : "SIGNAL_ENTRY",
        decision.rationale,
        signals[decision.ticker]?.combined ?? null
      );
      if (result.success) tradesExecuted++;
    } else if (decision.action === "SELL" && decision.ticker) {
      const result = await broker.sell(
        decision.ticker,
        date,
        this.fmp,
        decision.overridingSignal ? "LLM_OVERRIDE" : "SIGNAL_EXIT",
        decision.rationale
      );
      if (result.success) tradesExecuted++;
    }

    // 8. Persist trades + positions
    broker.persistToDB(this.db, date);

    // 9. Compute portfolio value and write snapshot
    const portfolioValue = await broker.getPortfolioValue(date, this.fmp);
    const positionValue = portfolioValue - broker.cash;
    const prevSnapshot = this.db.getLatestSnapshot(this.agentId);
    const prevValue = prevSnapshot?.portfolio_value ?? this.initialCash;
    const dailyReturn = prevValue > 0 ? (portfolioValue - prevValue) / prevValue : 0;
    const cumulativeReturn = (portfolioValue - this.initialCash) / this.initialCash;

    this.db.insertSnapshot({
      agent_id: this.agentId,
      date,
      portfolio_value: portfolioValue,
      cash: broker.cash,
      position_value: positionValue,
      num_positions: broker.positions.size,
      daily_return: dailyReturn,
      cumulative_return: cumulativeReturn,
    });

    // 10. Update agent state
    this.db.upsertAgentState({
      agent_id: this.agentId,
      cash: broker.cash,
      portfolio_value: portfolioValue,
      total_pnl: portfolioValue - this.initialCash,
      last_run_date: date,
      run_count: (this.db.getAgentState(this.agentId)?.run_count ?? 0) + 1,
    });

    // 11. Generate daily review
    const todayTrades = this.db.getTradesByDate(this.agentId, date);
    const reviewPrompt = this._buildReviewPrompt(todayTrades, dailyReturn, portfolioValue, marketContext);

    let review: DayReview;
    try {
      review = await generateStructuredWithRetry(reviewPrompt, DayReviewSchema, 0.7);
    } catch {
      review = {
        mood: "neutral",
        keyInsight: "Markets moved today.",
        fullReview: `${this.persona.name} reflected on the day's trading without strong conclusions.`,
      };
    }

    // 12. Store review in mem0
    await addMemory(this.agentId, review.fullReview);

    // 13. Persist review to DB
    this.db.upsertReview({
      agent_id: this.agentId,
      date,
      review_text: review.fullReview,
      mood: review.mood,
    });

    return {
      agentId: this.agentId,
      name: this.persona.name,
      date,
      tradesExecuted,
      portfolioValue,
      cumulativeReturn,
      mood: review.mood,
    };
  }

  private _buildDecisionPrompt(
    signals: Record<string, SignalResult>,
    broker: SimulatedBroker,
    memories: string[],
    ctx: MarketContext
  ): string {
    const { persona } = this;

    // Format top signals (exclude already-held positions)
    const heldTickers = new Set(broker.positions.keys());
    const topBuyCandidates = Object.entries(signals)
      .filter(([t]) => !heldTickers.has(t))
      .sort((a, b) => b[1].combined - a[1].combined)
      .slice(0, 5);

    const topSellCandidates = Array.from(broker.positions.keys()).map((t) => ({
      ticker: t,
      signal: signals[t]?.combined ?? 0.5,
      pos: broker.positions.get(t)!,
    }));

    const signalText = [
      "TOP BUY CANDIDATES (factor score 0-1, higher=more bullish):",
      ...topBuyCandidates.map(
        ([t, s]) => `  ${t}: score=${s.combined.toFixed(2)}, confidence=${s.confidence.toFixed(2)}`
      ),
      "",
      "CURRENT HOLDINGS (factor score = sell signal if low):",
      ...topSellCandidates.map(
        (h) =>
          `  ${h.ticker}: score=${h.signal.toFixed(2)}, unrealized P&L approx ${(((signals[h.ticker]?.combined ?? 0.5) - 0.5) * 20).toFixed(1)}%`
      ),
      topSellCandidates.length === 0 ? "  (no open positions)" : "",
    ]
      .filter((l) => l !== "  (no open positions)" || topSellCandidates.length === 0)
      .join("\n");

    const memoriesText =
      memories.length > 0
        ? `\nYOUR RELEVANT MEMORIES:\n${memories.map((m) => `  - ${m}`).join("\n")}\n`
        : "";

    const behaviorText = this._getBehavioralConstraints();

    return `You are ${persona.name}, age ${persona.age}.
Background: ${persona.background}
Personality traits: ${persona.personalityTraits.join(", ")}
Risk tolerance: ${persona.riskTolerance}
Trading style: ${persona.tradingStyle}
Your quirks: ${persona.quirks.join("; ")}

${behaviorText}

MARKET CONTEXT (${ctx.date}):
  SPY 1-day return: ${(ctx.spyReturn1d * 100).toFixed(2)}%
  SPY 5-day return: ${(ctx.spyReturn5d * 100).toFixed(2)}%
  Market regime: ${ctx.marketRegime}
  ${ctx.vixLevel ? `VIX: ${ctx.vixLevel.toFixed(1)}` : ""}

YOUR PORTFOLIO:
  Cash available: $${broker.cash.toLocaleString("en", { maximumFractionDigits: 0 })}
  Open positions: ${broker.positions.size}
${memoriesText}
SIGNALS:
${signalText}

Based on your personality, memories, and the signals above — what do you do TODAY?

Choose ONE action:
- BUY a specific ticker (give ticker and dollarAmount)
- SELL a specific ticker you currently hold
- HOLD (do nothing today)

Respond with JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "ticker": "AAPL",  // required for BUY/SELL
  "conviction": 0.0-1.0,
  "dollarAmount": 5000,  // for BUY only
  "rationale": "1-2 sentence explanation in your voice",
  "overridingSignal": false  // true if you're going against the quantitative signal
}`;
  }

  private _getBehavioralConstraints(): string {
    const { persona } = this;
    const lines: string[] = [];

    if (persona.riskTolerance === "reckless") {
      lines.push("You tend to oversize positions and often ignore signals that don't match your gut.");
    } else if (persona.riskTolerance === "low") {
      lines.push("You need very high conviction before entering. When uncertain, you stay in cash.");
    }

    if (persona.personalityTraits.some((t) => t.toLowerCase().includes("contrarian"))) {
      lines.push("You are skeptical of consensus. When a signal is very high, you look for the catch.");
    }
    if (persona.personalityTraits.some((t) => t.toLowerCase().includes("fomo"))) {
      lines.push("When you see strong upward momentum, you feel compelled to act even without a full signal.");
    }
    if (persona.personalityTraits.some((t) => t.toLowerCase().includes("discipline"))) {
      lines.push("You strictly follow signals and rarely deviate from your system.");
    }

    return lines.length > 0 ? "BEHAVIORAL NOTES:\n" + lines.map((l) => `  - ${l}`).join("\n") : "";
  }

  private _buildReviewPrompt(
    trades: any[],
    dailyReturn: number,
    portfolioValue: number,
    ctx: MarketContext
  ): string {
    const { persona } = this;
    const tradeStr =
      trades.length > 0
        ? trades
            .map((t) => `  ${t.side} ${t.shares} shares of ${t.ticker} @ $${t.price.toFixed(2)} (${t.reason})`)
            .join("\n")
        : "  No trades today.";

    return `You are ${persona.name}. Today is ${ctx.date}.

Your trades today:
${tradeStr}

Your daily return: ${(dailyReturn * 100).toFixed(2)}%
Portfolio value: $${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })}
Market: SPY ${(ctx.spyReturn1d * 100).toFixed(2)}% today, regime: ${ctx.marketRegime}

Write a brief end-of-day journal entry in your own voice. Reflect on what happened, how you feel, and any lessons or updated beliefs.

Respond with JSON:
{
  "mood": "bullish" | "cautious" | "frustrated" | "confident" | "anxious" | "neutral" | "euphoric" | "depressed",
  "keyInsight": "one-sentence key takeaway",
  "fullReview": "3-5 sentence journal entry in your voice"
}`;
  }
}
