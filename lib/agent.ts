/**
 * TraderAgent — runs one trader's daily cycle (split into temporal phases).
 */

import { z } from "zod";
import { SimDB } from "./db/repository";
import { SimulatedBroker } from "./broker";
import { FMPClient } from "./fmp";
import { SignalResult } from "./signals";
import { generateStructuredWithRetry } from "./llm";
import { type IFileStore, type TickerBelief } from "./fileStore";
import { EmbeddingClient } from "./embeddings";
import { TokenBucket } from "../daemon/rateLimiter";

// ---- Schemas ----

const TradingDecisionSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  ticker: z.string().optional(),
  conviction: z.number().min(0).max(1),
  dollarAmount: z.number().optional(),
  rationale: z.string(),
  overridingSignal: z.boolean(),
});
export type TradingDecision = z.infer<typeof TradingDecisionSchema>;

const TradingDecisionsSchema = z.array(TradingDecisionSchema).min(0).max(5);

const DayReviewSchema = z.object({
  mood: z.enum(["bullish", "cautious", "frustrated", "confident", "anxious", "neutral", "euphoric", "depressed"]),
  keyInsight: z.string(),
  fullReview: z.string(),
  noteToSelf: z.string(),
});
export type DayReview = z.infer<typeof DayReviewSchema>;

const AlertDecisionSchema = z.object({
  action: z.enum(["SELL", "HOLD", "SCALE"]),
  rationale: z.string(),
});

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

// ---- Agent config loaded from DB ----
export interface AgentConfig {
  id: number;
  name: string;
  initialCash: number;
  decisionTemperature: number;
  convictionMultiplier: number;
}

// ---- TraderAgent ----

export class TraderAgent {
  constructor(
    private agentId: number,
    private config: AgentConfig,
    private db: SimDB,
    private fmp: FMPClient,
    private fileStore: IFileStore,
    private embeddings: EmbeddingClient,
    private llmBucket: TokenBucket
  ) {}

  // ---- Phase 1: Decision + Trade Execution (09:35 ET) ----

  async runDecisionPhase(
    marketContext: MarketContext,
    cachedSignals: Record<string, SignalResult>
  ): Promise<{ tradesExecuted: number }> {
    const { date } = marketContext;

    const broker = await SimulatedBroker.fromDB(this.agentId, this.db);

    // Check trailing stop-losses first
    await broker.checkStopLosses(date, this.fmp, 0.2, "marketOpen");

    // Load agent soul files
    const files = await this.fileStore.loadAgentFiles(this.agentId);

    // Search episodic memory
    const queryText = `Trading decisions and market observations for ${marketContext.marketRegime} regime`;
    const queryEmbedding = await this.embeddings.embed(queryText);
    const memories = await this.db.searchEpisodicMemory(this.agentId, queryEmbedding, 5);

    // Build decision prompt
    const prompt = this._buildDecisionPrompt(files, cachedSignals, memories.map((m) => m.content), broker, marketContext);

    // Rate-limit LLM calls
    await this.llmBucket.waitForToken();

    let decisions: TradingDecision[];
    try {
      decisions = await generateStructuredWithRetry(prompt, TradingDecisionsSchema, this.config.decisionTemperature);
    } catch (e) {
      console.error(`[agent ${this.agentId}] LLM decision failed:`, (e as Error).message);
      decisions = [];
    }

    console.log(`[agent ${this.agentId}] ${decisions.length} decisions: ${decisions.map(d => `${d.action} ${d.ticker ?? ''}`).join(', ') || 'HOLD'}`);

    let tradesExecuted = 0;

    for (const decision of decisions) {
      if (decision.action === "BUY" && decision.ticker) {
        const maxCash = broker.cash * 0.9;
        const rawAmount = decision.dollarAmount ?? maxCash * 0.25;
        const adjustedAmount = rawAmount * this.config.convictionMultiplier;
        const finalAmount = Math.min(adjustedAmount, maxCash * 0.4);

        const result = await broker.buy(
          decision.ticker,
          finalAmount,
          date,
          this.fmp,
          decision.overridingSignal ? "LLM_OVERRIDE" : "SIGNAL_ENTRY",
          decision.rationale,
          cachedSignals[decision.ticker]?.combined ?? null,
          "marketOpen"
        );
        if (result.success) {
          tradesExecuted++;
          await this.fileStore.updateTickerBelief(this.agentId, decision.ticker, {
            thesis: decision.rationale,
            sentiment: "bullish",
            confidence: decision.conviction,
            lastTrade: {
              side: "BUY",
              date,
              price: result.price,
              outcome: null,
              pnl: null,
            },
          });
        } else {
          console.warn(`[agent ${this.agentId}] Buy ${decision.ticker} failed: ${result.error}`);
        }
      } else if (decision.action === "SELL" && decision.ticker) {
        const result = await broker.sell(
          decision.ticker,
          date,
          this.fmp,
          decision.overridingSignal ? "LLM_OVERRIDE" : "SIGNAL_EXIT",
          decision.rationale,
          "marketOpen"
        );
        if (result.success) {
          tradesExecuted++;
          await this.fileStore.updateTickerBelief(this.agentId, decision.ticker, {
            sentiment: "bearish",
            confidence: decision.conviction,
            lastTrade: {
              side: "SELL",
              date,
              price: result.price,
              outcome: null,
              pnl: null,
            },
          });
        } else {
          console.warn(`[agent ${this.agentId}] Sell ${decision.ticker} failed: ${result.error}`);
        }
      }
    }

    await broker.persistToDB(this.db, date);

    return { tradesExecuted };
  }

  // ---- Phase 2: Review + Memory (16:30 ET) ----

  async runReviewPhase(marketContext: MarketContext): Promise<DayReview> {
    const { date } = marketContext;

    const broker = await SimulatedBroker.fromDB(this.agentId, this.db);
    const portfolioValue = await broker.getPortfolioValue(date, this.fmp);
    const positionValue = portfolioValue - broker.cash;

    const [todayTrades, prevSnapshot, files] = await Promise.all([
      this.db.getTradesByDate(this.agentId, date),
      this.db.getLatestSnapshot(this.agentId),
      this.fileStore.loadAgentFiles(this.agentId),
    ]);

    const prevValue = prevSnapshot?.portfolio_value
      ? Number(prevSnapshot.portfolio_value)
      : this.config.initialCash;
    const dailyReturn = prevValue > 0 ? (portfolioValue - prevValue) / prevValue : 0;
    const cumulativeReturn = (portfolioValue - this.config.initialCash) / this.config.initialCash;

    // Write EOD snapshot
    await this.db.insertSnapshot({
      agent_id: this.agentId,
      date,
      portfolio_value: portfolioValue,
      cash: broker.cash,
      position_value: positionValue,
      num_positions: broker.positions.size,
      daily_return: dailyReturn,
      cumulative_return: cumulativeReturn,
    });

    // Update agent state
    const currentState = await this.db.getAgentState(this.agentId);
    await this.db.upsertAgentState({
      agent_id: this.agentId,
      cash: broker.cash,
      portfolio_value: portfolioValue,
      total_pnl: portfolioValue - this.config.initialCash,
      last_run_date: date,
      run_count: (currentState?.run_count ?? 0) + 1,
    });

    // Build review prompt
    const reviewPrompt = this._buildReviewPrompt(files, todayTrades, dailyReturn, portfolioValue, broker, marketContext);

    await this.llmBucket.waitForToken();

    let review: DayReview;
    try {
      review = await generateStructuredWithRetry(reviewPrompt, DayReviewSchema, 0.7);
    } catch (e) {
      console.error(`[agent ${this.agentId}] LLM review failed:`, (e as Error).message);
      review = {
        mood: "neutral",
        keyInsight: "Markets moved today.",
        fullReview: `${this.config.name} reflected on the day's trading.`,
        noteToSelf: "Stay disciplined.",
      };
    }

    // Write journal file
    const journalContent = this._formatJournal(date, review, todayTrades, dailyReturn, portfolioValue, broker, marketContext);
    await this.fileStore.writeJournal(this.agentId, date, journalContent);

    // Embed and store in episodic memory
    const embedding = await this.embeddings.embed(review.fullReview);
    await this.db.insertMemory(this.agentId, review.fullReview, embedding, "daily_review");

    return review;
  }

  // ---- Alert Response (called by priceMonitor) ----

  async respondToAlert(
    alert: { id: number; ticker: string; pct_change: number; price: number; alert_type: string },
    marketContext: MarketContext
  ): Promise<{ sold: boolean; rationale: string }> {
    const broker = await SimulatedBroker.fromDB(this.agentId, this.db);

    // Only respond if we hold this ticker
    if (!broker.positions.has(alert.ticker)) {
      return { sold: false, rationale: "not_holding" };
    }

    const files = await this.fileStore.loadAgentFiles(this.agentId);
    const belief = files.beliefs[alert.ticker];

    const prompt = `You are ${this.config.name}.

Your strategy:
${files.strategy}

Your belief about ${alert.ticker}:
${JSON.stringify(belief ?? {}, null, 2)}

ALERT: ${alert.ticker} has moved ${(alert.pct_change * 100).toFixed(1)}% (${alert.alert_type}).
Current price: $${alert.price}

Do you SELL now (protect gains/cut losses), HOLD (wait it out), or SCALE (add more)?
Respond with JSON: { "action": "SELL" | "HOLD" | "SCALE", "rationale": "..." }`;

    await this.llmBucket.waitForToken();

    let decision: z.infer<typeof AlertDecisionSchema>;
    try {
      decision = await generateStructuredWithRetry(prompt, AlertDecisionSchema, 0.5);
    } catch (e) {
      console.error(`[agent ${this.agentId}] LLM alert decision failed:`, (e as Error).message);
      return { sold: false, rationale: "llm_error" };
  }

    if (decision.action === "SELL") {
      const result = await broker.sell(
        alert.ticker,
        marketContext.date,
        this.fmp,
        `ALERT_${alert.alert_type.toUpperCase()}`,
        decision.rationale,
        "priceMonitor"
      );
      if (result.success) {
        await broker.persistToDB(this.db, marketContext.date);
        await this.fileStore.updateTickerBelief(this.agentId, alert.ticker, {
          sentiment: "bearish",
          notes: `Sold on alert: ${alert.alert_type} at ${(alert.pct_change * 100).toFixed(1)}%`,
        });
        return { sold: true, rationale: decision.rationale };
      }
    }

    return { sold: false, rationale: decision.rationale };
  }

  // ---- Backward-compat wrapper ----

  async runDay(marketContext: MarketContext): Promise<DayResult> {
    // Compute signals inline (no cache)
    const { computeBatchSignals } = await import("./signals");
    const files = await this.fileStore.loadAgentFiles(this.agentId);
    // Parse watchlist from strategy.md (simple approach: look for ticker-like words)
    const watchlist = this._parseWatchlistFromStrategy(files.strategy);
    const signals = await computeBatchSignals(
      watchlist,
      marketContext.date,
      this.fmp,
    );

    const { tradesExecuted } = await this.runDecisionPhase(marketContext, signals);
    const review = await this.runReviewPhase(marketContext);

    const snapshot = await this.db.getLatestSnapshot(this.agentId);
    return {
      agentId: this.agentId,
      name: this.config.name,
      date: marketContext.date,
      tradesExecuted,
      portfolioValue: snapshot?.portfolio_value ? Number(snapshot.portfolio_value) : this.config.initialCash,
      cumulativeReturn: snapshot?.cumulative_return ? Number(snapshot.cumulative_return) : 0,
      mood: review.mood,
    };
  }

  // ---- Private helpers ----

  private _buildDecisionPrompt(
    files: Awaited<ReturnType<IFileStore["loadAgentFiles"]>>,
    signals: Record<string, SignalResult>,
    memories: string[],
    broker: SimulatedBroker,
    ctx: MarketContext
  ): string {
    const heldTickers = new Set(broker.positions.keys());
    const topBuys = Object.entries(signals)
      .filter(([t]) => !heldTickers.has(t))
      .sort((a, b) => b[1].combined - a[1].combined)
      .slice(0, 8)
      .map(([t, s]) => `${t}: graham=${(s.factors.graham ?? s.combined).toFixed(2)} momentum=${(s.factors.momentum ?? s.combined).toFixed(2)} combined=${s.combined.toFixed(2)}`)
      .join("\n");

    const holdings = Array.from(broker.positions.keys())
      .map((t) => {
        const s = signals[t];
        return `${t}: combined=${s?.combined.toFixed(2) ?? "N/A"}`;
      })
      .join("\n") || "(none)";

    return `<identity>
${files.identity}
</identity>

<strategy>
${files.strategy}
</strategy>

<beliefs>
${JSON.stringify(files.beliefs, null, 2)}
</beliefs>

<recent_journals>
${files.recentJournals.join("\n---\n")}
</recent_journals>

<episodic_memories>
${memories.map((m) => `- ${m}`).join("\n") || "(none yet)"}
</episodic_memories>

<current_portfolio>
Cash: $${broker.cash.toLocaleString("en", { maximumFractionDigits: 0 })}
Positions: ${broker.positions.size}
</current_portfolio>

<market_context>
Date: ${ctx.date}
SPY 1d: ${(ctx.spyReturn1d * 100).toFixed(2)}%
SPY 5d: ${(ctx.spyReturn5d * 100).toFixed(2)}%
VIX: ${ctx.vixLevel ?? "N/A"}
Regime: ${ctx.marketRegime}
</market_context>

<today_signals>
TOP BUY CANDIDATES:
${topBuys}

CURRENT HOLDINGS:
${holdings}
</today_signals>

<task>
You are ${this.config.name}. Based on your identity, strategy, beliefs, recent experience, and today's signals, decide your trading actions.

Return a JSON array of TradingDecision objects (can be empty array if holding).
You may return multiple decisions (e.g., sell one and buy another).
Each must include a rationale grounded in your strategy document.

Schema: [{ "action": "BUY"|"SELL"|"HOLD", "ticker": "AAPL", "conviction": 0.0-1.0, "dollarAmount": 5000, "rationale": "...", "overridingSignal": false }]
</task>`;
  }

  private _buildReviewPrompt(
    files: Awaited<ReturnType<IFileStore["loadAgentFiles"]>>,
    trades: any[],
    dailyReturn: number,
    portfolioValue: number,
    broker: SimulatedBroker,
    ctx: MarketContext
  ): string {
    const tradeStr = trades.length > 0
      ? trades.map((t) => `  ${t.side} ${t.shares} ${t.ticker} @ $${Number(t.price).toFixed(2)} (${t.reason})`).join("\n")
      : "  No trades today.";

    return `<identity>
${files.identity}
</identity>

<strategy>
${files.strategy}
</strategy>

You are ${this.config.name}. Today is ${ctx.date}.

Trades today:
${tradeStr}

Portfolio: $${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })} | Cash: $${broker.cash.toLocaleString("en", { maximumFractionDigits: 0 })} | Positions: ${broker.positions.size}
Daily return: ${(dailyReturn * 100).toFixed(2)}%
Market: SPY ${(ctx.spyReturn1d * 100).toFixed(2)}% | Regime: ${ctx.marketRegime}

Write your end-of-day journal entry. Reflect in your own voice. What happened? What did you learn? What will you do differently?

Respond with JSON:
{
  "mood": "bullish"|"cautious"|"frustrated"|"confident"|"anxious"|"neutral"|"euphoric"|"depressed",
  "keyInsight": "one sentence",
  "fullReview": "3-5 sentence journal entry in your voice",
  "noteToSelf": "specific actionable reminder for future decisions"
}`;
  }

  private _formatJournal(
    date: string,
    review: DayReview,
    trades: any[],
    dailyReturn: number,
    portfolioValue: number,
    broker: SimulatedBroker,
    ctx: MarketContext
  ): string {
    const tradeLines = trades.length > 0
      ? trades.map((t) => `- ${t.side} ${t.shares} ${t.ticker} @ $${Number(t.price).toFixed(2)} — ${t.reason}`).join("\n")
      : "- No trades today.";

    return `# ${date} — Daily Review

## Mood: ${review.mood}

## Market Context
SPY ${(ctx.spyReturn1d * 100).toFixed(2)}% today (5d: ${(ctx.spyReturn5d * 100).toFixed(2)}%) | VIX: ${ctx.vixLevel ?? "N/A"} | Regime: ${ctx.marketRegime}

## Trades Today
${tradeLines}

## Portfolio Status
- Cash: $${broker.cash.toLocaleString("en", { maximumFractionDigits: 0 })} | Positions: ${broker.positions.size} | Total value: $${portfolioValue.toLocaleString("en", { maximumFractionDigits: 0 })}
- Daily return: ${(dailyReturn * 100).toFixed(2)}%

## Reflection
${review.fullReview}

## Note to Self
${review.noteToSelf}
`;
  }

  private _parseWatchlistFromStrategy(strategyMd: string): string[] {
    // Extract all-caps 1-5 char words that look like tickers
    const matches = strategyMd.match(/\b[A-Z]{1,5}\b/g) ?? [];
    const seen = new Set<string>();
    const tickers: string[] = [];
    for (const m of matches) {
      if (!seen.has(m) && m.length >= 1) {
        seen.add(m);
        tickers.push(m);
      }
    }
    return tickers.slice(0, 30);
  }
}
