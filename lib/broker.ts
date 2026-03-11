/**
 * SimulatedBroker — per-agent paper trading account.
 * Reconstructed from DB at the start of each day (stateless between runs).
 */

import { SimDB, PositionRow, TradeRow } from "./db/repository";
import { FMPClient } from "./fmp";

const COMMISSION_RATE = 0.001; // 0.1%
const SLIPPAGE_BPS = 5; // 5 basis points

export interface BrokerPosition {
  ticker: string;
  shares: number;
  entryPrice: number;
  entryDate: string;
  trailingHigh: number;
  costBasis: number;
}

export interface OrderResult {
  success: boolean;
  ticker: string;
  side: "BUY" | "SELL";
  shares: number;
  price: number;
  commission: number;
  cashAfter: number;
  reason: string;
  error?: string;
}

export class SimulatedBroker {
  agentId: number;
  cash: number;
  positions: Map<string, BrokerPosition>;
  private pendingTrades: Omit<TradeRow, "id">[];
  private commissionRate: number;
  private slippageBps: number;

  constructor(
    agentId: number,
    cash: number,
    positions: BrokerPosition[] = [],
    commissionRate = COMMISSION_RATE,
    slippageBps = SLIPPAGE_BPS
  ) {
    this.agentId = agentId;
    this.cash = cash;
    this.positions = new Map(positions.map((p) => [p.ticker, { ...p }]));
    this.pendingTrades = [];
    this.commissionRate = commissionRate;
    this.slippageBps = slippageBps;
  }

  static async fromDB(agentId: number, db: SimDB): Promise<SimulatedBroker> {
    const [state, posRows] = await Promise.all([
      db.getAgentState(agentId),
      db.getPositions(agentId),
    ]);
    const cash = state?.cash ?? 100_000;
    const positions: BrokerPosition[] = posRows.map((r) => ({
      ticker: r.ticker,
      shares: Number(r.shares),
      entryPrice: Number(r.entry_price),
      entryDate: r.entry_date,
      trailingHigh: Number(r.trailing_high),
      costBasis: Number(r.cost_basis),
    }));
    return new SimulatedBroker(agentId, Number(cash), positions);
  }

  async getPrice(ticker: string, fmp: FMPClient): Promise<number | null> {
    try {
      const quote = await fmp.getQuote(ticker);
      return quote?.price ?? null;
    } catch {
      return null;
    }
  }

  async getPortfolioValue(date: string, fmp: FMPClient): Promise<number> {
    let positionValue = 0;
    const tickers = Array.from(this.positions.keys());
    if (tickers.length > 0) {
      const quotes = await fmp.getBatchQuotes(tickers);
      for (const [ticker, pos] of this.positions) {
        const price = quotes[ticker]?.price ?? pos.entryPrice;
        positionValue += price * pos.shares;
      }
    }
    return this.cash + positionValue;
  }

  async getPositionValues(fmp: FMPClient): Promise<Record<string, number>> {
    const tickers = Array.from(this.positions.keys());
    if (tickers.length === 0) return {};
    const quotes = await fmp.getBatchQuotes(tickers);
    const result: Record<string, number> = {};
    for (const [ticker, pos] of this.positions) {
      result[ticker] = (quotes[ticker]?.price ?? pos.entryPrice) * pos.shares;
    }
    return result;
  }

  async buy(
    ticker: string,
    dollarAmount: number,
    date: string,
    fmp: FMPClient,
    reason = "SIGNAL_ENTRY",
    llmRationale: string | null = null,
    signalScore: number | null = null,
    phase = "marketOpen"
  ): Promise<OrderResult> {
    if (this.positions.has(ticker)) {
      return { success: false, ticker, side: "BUY", shares: 0, price: 0, commission: 0, cashAfter: this.cash, reason, error: "already_holding" };
    }

    const rawPrice = await this.getPrice(ticker, fmp);
    if (!rawPrice) {
      return { success: false, ticker, side: "BUY", shares: 0, price: 0, commission: 0, cashAfter: this.cash, reason, error: "no_price" };
    }

    const price = rawPrice * (1 + this.slippageBps / 10_000);
    const maxSpend = Math.min(dollarAmount, this.cash * 0.95);
    if (maxSpend < price) {
      return { success: false, ticker, side: "BUY", shares: 0, price, commission: 0, cashAfter: this.cash, reason, error: "insufficient_cash" };
    }

    const shares = Math.floor(maxSpend / price / (1 + this.commissionRate));
    if (shares < 1) {
      return { success: false, ticker, side: "BUY", shares: 0, price, commission: 0, cashAfter: this.cash, reason, error: "too_small" };
    }

    const commission = shares * price * this.commissionRate;
    const totalCost = shares * price + commission;
    this.cash -= totalCost;

    this.positions.set(ticker, {
      ticker,
      shares,
      entryPrice: price,
      entryDate: date,
      trailingHigh: price,
      costBasis: totalCost,
    });

    this.pendingTrades.push({
      agent_id: this.agentId,
      date,
      ticker,
      side: "BUY",
      shares,
      price,
      value: shares * price,
      commission,
      cash_after: this.cash,
      reason,
      llm_rationale: llmRationale,
      signal_score: signalScore,
      phase,
    });

    return { success: true, ticker, side: "BUY", shares, price, commission, cashAfter: this.cash, reason };
  }

  async sell(
    ticker: string,
    date: string,
    fmp: FMPClient,
    reason = "SIGNAL_EXIT",
    llmRationale: string | null = null,
    phase = "marketOpen"
  ): Promise<OrderResult> {
    const pos = this.positions.get(ticker);
    if (!pos) {
      return { success: false, ticker, side: "SELL", shares: 0, price: 0, commission: 0, cashAfter: this.cash, reason, error: "no_position" };
    }

    const rawPrice = await this.getPrice(ticker, fmp);
    if (!rawPrice) {
      return { success: false, ticker, side: "SELL", shares: 0, price: 0, commission: 0, cashAfter: this.cash, reason, error: "no_price" };
    }

    const price = rawPrice * (1 - this.slippageBps / 10_000);
    const proceeds = pos.shares * price;
    const commission = proceeds * this.commissionRate;
    this.cash += proceeds - commission;

    this.positions.delete(ticker);

    this.pendingTrades.push({
      agent_id: this.agentId,
      date,
      ticker,
      side: "SELL",
      shares: pos.shares,
      price,
      value: proceeds,
      commission,
      cash_after: this.cash,
      reason,
      llm_rationale: llmRationale,
      signal_score: null,
      phase,
    });

    return { success: true, ticker, side: "SELL", shares: pos.shares, price, commission, cashAfter: this.cash, reason };
  }

  async checkStopLosses(
    date: string,
    fmp: FMPClient,
    stopLossPct = 0.2,
    phase = "midday"
  ): Promise<OrderResult[]> {
    const results: OrderResult[] = [];
    const tickers = Array.from(this.positions.keys());
    if (tickers.length === 0) return results;

    const quotes = await fmp.getBatchQuotes(tickers);

    for (const [ticker, pos] of this.positions) {
      const price = quotes[ticker]?.price;
      if (!price) continue;

      if (price > pos.trailingHigh) {
        pos.trailingHigh = price;
      }

      const drawdown = (pos.trailingHigh - price) / pos.trailingHigh;
      if (drawdown >= stopLossPct) {
        const r = await this.sell(ticker, date, fmp, "STOP_LOSS", null, phase);
        results.push(r);
      }
    }

    return results;
  }

  /** Persist current positions and all pending trades to DB (async). */
  async persistToDB(db: SimDB, date: string): Promise<void> {
    // Write all pending trades
    for (const t of this.pendingTrades) {
      await db.insertTrade(t);
    }

    // Upsert current positions
    const existingRows = await db.getPositions(this.agentId);
    const existingTickers = new Set(existingRows.map((p) => p.ticker));

    for (const [ticker, pos] of this.positions) {
      await db.upsertPosition({
        agent_id: this.agentId,
        ticker: pos.ticker,
        shares: pos.shares,
        entry_price: pos.entryPrice,
        entry_date: pos.entryDate,
        trailing_high: pos.trailingHigh,
        cost_basis: pos.costBasis,
      });
      existingTickers.delete(ticker);
    }

    // Delete positions that were closed
    for (const ticker of existingTickers) {
      await db.deletePosition(this.agentId, ticker);
    }

    this.pendingTrades = [];
  }

  getPendingTrades(): Omit<TradeRow, "id">[] {
    return [...this.pendingTrades];
  }

  getPositionList(): BrokerPosition[] {
    return Array.from(this.positions.values());
  }
}
