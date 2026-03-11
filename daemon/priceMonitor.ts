/**
 * Price Monitor — 5-min intraday spike detection.
 * Detects >3% moves on held positions, triggers respondToAlert() for relevant agents.
 */

import { SimDB } from "../lib/db/repository";
import { FMPClient } from "../lib/fmp";
import { type IFileStore } from "../lib/fileStore";
import { EmbeddingClient } from "../lib/embeddings";
import { TraderAgent, MarketContext, AgentConfig } from "../lib/agent";
import { TokenBucket } from "./rateLimiter";

const SPIKE_THRESHOLD = 0.03; // 3%

interface TickerSnapshot {
  price: number;
  timestamp: number;
}

const priceHistory = new Map<string, TickerSnapshot>();

export async function runPriceMonitor(
  date: string,
  marketContext: MarketContext,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore,
  embeddings: EmbeddingClient,
  llmBucket: TokenBucket
): Promise<void> {
  // Collect all unique tickers currently held by any agent
  const agents = await db.getAllAgents();
  const heldTickers = new Set<string>();

  for (const agent of agents) {
    const positions = await db.getPositions(agent.id);
    for (const p of positions) heldTickers.add(p.ticker);
  }

  if (heldTickers.size === 0) return;

  const tickers = Array.from(heldTickers);
  const quotes = await fmp.getBatchQuotes(tickers);

  const spikes: Array<{
    ticker: string;
    pctChange: number;
    price: number;
    alertType: "spike_up" | "spike_down";
  }> = [];

  const now = Date.now();

  for (const ticker of tickers) {
    const quote = quotes[ticker];
    if (!quote?.price) continue;

    const prev = priceHistory.get(ticker);
    priceHistory.set(ticker, { price: quote.price, timestamp: now });

    if (!prev) continue; // First reading for this ticker

    const pctChange = (quote.price - prev.price) / prev.price;
    if (Math.abs(pctChange) >= SPIKE_THRESHOLD) {
      spikes.push({
        ticker,
        pctChange,
        price: quote.price,
        alertType: pctChange > 0 ? "spike_up" : "spike_down",
      });
    }
  }

  if (spikes.length === 0) return;

  console.log(`[priceMonitor] ${spikes.length} spikes detected:`, spikes.map((s) => `${s.ticker} ${(s.pctChange * 100).toFixed(1)}%`).join(", "));

  // Insert alerts
  for (const spike of spikes) {
    await db.insertPriceAlert({
      ticker: spike.ticker,
      alert_type: spike.alertType,
      pct_change: spike.pctChange,
      price: spike.price,
    });
  }

  // For each spike, find agents holding that ticker and call respondToAlert()
  for (const spike of spikes) {
    for (const agentRow of agents) {
      const positions = await db.getPositions(agentRow.id);
      const holds = positions.some((p) => p.ticker === spike.ticker);
      if (!holds) continue;

      // Get pending alert for this ticker
      const pendingAlerts = await db.getPendingAlerts();
      const alert = pendingAlerts.find((a) => a.ticker === spike.ticker && !a.processed);
      if (!alert) continue;

      const config: AgentConfig = {
        id: agentRow.id,
        name: agentRow.name,
        strategyName: agentRow.strategy_name,
        initialCash: Number(agentRow.initial_cash),
        decisionTemperature: 0.5,
        convictionMultiplier: 1.0,
      };

      const trader = new TraderAgent(agentRow.id, config, db, fmp, fileStore, embeddings, llmBucket);
      try {
        await trader.respondToAlert(
          { id: alert.id, ticker: alert.ticker, pct_change: Number(alert.pct_change), price: Number(alert.price), alert_type: alert.alert_type },
          marketContext
        );
        await db.markAlertProcessed(alert.id);
      } catch (e) {
        console.error(`[priceMonitor] Agent ${agentRow.id} alert response failed:`, (e as Error).message);
      }
    }
  }
}
