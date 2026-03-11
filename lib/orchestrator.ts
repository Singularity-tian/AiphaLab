/**
 * DailyOrchestrator — advances all agents through one trading day.
 * Idempotent: safe to re-run if it crashes mid-way.
 */

import { SimDB } from "./db/repository";
import { TraderAgent, MarketContext } from "./agent";
import { FMPClient } from "./fmp";
import { TraderPersona } from "./persona";

export interface OrchestratorResult {
  date: string;
  agentsProcessed: number;
  skippedAlreadyDone: boolean;
  marketOpen: boolean;
  errors: string[];
  summary(): string;
}

const CONCURRENCY = 5;
const LLM_DELAY_MS = 500; // delay between agent batches to respect rate limits

export class DailyOrchestrator {
  private db: SimDB;
  private fmp: FMPClient;

  constructor(db: SimDB, fmp: FMPClient) {
    this.db = db;
    this.fmp = fmp;
  }

  async advanceDay(targetDate?: string): Promise<OrchestratorResult> {
    // Determine which date to process
    const date = targetDate ?? this._nextBusinessDay();

    // Idempotency check — if already fully processed, skip
    const existing = this.db.getSimLog(date);
    if (existing?.finished_at) {
      return {
        date,
        agentsProcessed: existing.agents_processed,
        skippedAlreadyDone: true,
        marketOpen: existing.market_open === 1,
        errors: [],
        summary: () => `[${date}] Already processed (${existing.agents_processed} agents). Skipping.`,
      };
    }

    // Check market open
    const marketOpen = await this._isMarketOpen(date);
    if (!marketOpen) {
      this.db.insertSimLog({
        date,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        agents_processed: 0,
        market_open: 0,
      });
      return {
        date,
        agentsProcessed: 0,
        skippedAlreadyDone: false,
        marketOpen: false,
        errors: [],
        summary: () => `[${date}] Market closed. No trading.`,
      };
    }

    // Start log entry
    this.db.insertSimLog({
      date,
      started_at: new Date().toISOString(),
      finished_at: null,
      agents_processed: 0,
      market_open: 1,
    });

    // Build market context
    const marketContext = await this._buildMarketContext(date);
    console.log(
      `[${date}] Market: SPY ${(marketContext.spyReturn1d * 100).toFixed(2)}% | ${marketContext.marketRegime}`
    );

    // Load all active agents
    const agentRows = this.db.getAllAgents();
    const errors: string[] = [];
    let processed = 0;

    // Process in batches of CONCURRENCY
    for (let i = 0; i < agentRows.length; i += CONCURRENCY) {
      const batch = agentRows.slice(i, i + CONCURRENCY);

      const batchPromises = batch.map(async (row) => {
        // Skip if this agent already has a snapshot for today (crash recovery)
        if (this.db.hasSnapshot(row.id, date)) {
          return;
        }

        try {
          const persona: TraderPersona = JSON.parse(row.persona_json);
          const agent = new TraderAgent(
            row.id,
            persona,
            row.strategy_name,
            row.initial_cash,
            this.db,
            this.fmp
          );
          const result = await agent.runDay(marketContext);
          processed++;
          console.log(
            `  [${result.name}] ${result.mood} | P&L: ${(result.cumulativeReturn * 100).toFixed(1)}% | trades: ${result.tradesExecuted}`
          );
        } catch (e) {
          const msg = `Agent ${row.id} (${row.name}) failed: ${e instanceof Error ? e.message : String(e)}`;
          console.error(`  ERROR: ${msg}`);
          errors.push(msg);
        }
      });

      await Promise.all(batchPromises);

      // Rate limiting between batches
      if (i + CONCURRENCY < agentRows.length) {
        await sleep(LLM_DELAY_MS);
      }
    }

    // Finish log
    this.db.finishSimLog(date, processed);

    return {
      date,
      agentsProcessed: processed,
      skippedAlreadyDone: false,
      marketOpen: true,
      errors,
      summary: () =>
        `[${date}] Processed ${processed}/${agentRows.length} agents. Errors: ${errors.length}`,
    };
  }

  private _nextBusinessDay(): string {
    const last = this.db.getLastSimLog();
    const base = last?.date ?? yesterday();
    return nextBusinessDay(base);
  }

  private async _isMarketOpen(date: string): Promise<boolean> {
    // Weekends are always closed
    const d = new Date(date + "T12:00:00Z");
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return false;

    // Try FMP to confirm (handles holidays)
    try {
      return await this.fmp.isMarketOpen(date);
    } catch {
      // If FMP fails, assume open on weekdays
      return true;
    }
  }

  private async _buildMarketContext(date: string): Promise<MarketContext> {
    try {
      const spyBars = await this.fmp.getSpyContext(date);

      const n = spyBars.length;
      const spyReturn1d =
        n >= 2 ? (spyBars[n - 1].close - spyBars[n - 2].close) / spyBars[n - 2].close : 0;
      const spyReturn5d =
        n >= 6 ? (spyBars[n - 1].close - spyBars[n - 6].close) / spyBars[n - 6].close : 0;

      // Classify regime
      let marketRegime: MarketContext["marketRegime"] = "choppy";
      if (spyReturn5d > 0.01) marketRegime = "trending_up";
      else if (spyReturn5d < -0.01) marketRegime = "trending_down";

      // Try to get VIX
      let vixLevel: number | null = null;
      try {
        const vix = await this.fmp.getQuote("^VIX");
        vixLevel = vix?.price ?? null;
      } catch {}

      return { date, spyReturn1d, spyReturn5d, vixLevel, marketRegime };
    } catch {
      return { date, spyReturn1d: 0, spyReturn5d: 0, vixLevel: null, marketRegime: "choppy" };
    }
  }

  getLeaderboard(limit = 20) {
    return this.db.getLeaderboard(limit);
  }
}

// ---- Date helpers ----

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function nextBusinessDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
