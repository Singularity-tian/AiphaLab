/**
 * Price Monitor — 5-min intraday spike detection.
 * Detects >3% moves on held positions, triggers respondToAlert() for relevant agents.
 */

import { SimDB } from "../lib/db/repository";
import { FMPClient } from "../lib/fmp";
import { type IFileStore } from "../lib/fileStore";
import { EmbeddingClient } from "../lib/embeddings";
import { TraderAgent, MarketContext, AgentConfig, parseAgentParams } from "../lib/agent";
import { TokenBucket } from "./rateLimiter";

const SPIKE_THRESHOLD = 0.03; // 3%
const PRICE_HISTORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface TickerSnapshot {
  price: number;
  timestamp: number;
}

const priceHistory = new Map<string, TickerSnapshot>();

/** Remove stale entries from priceHistory to prevent unbounded memory growth. */
function cleanupPriceHistory() {
  const cutoff = Date.now() - PRICE_HISTORY_TTL_MS;
  for (const [ticker, snap] of priceHistory) {
    if (snap.timestamp < cutoff) priceHistory.delete(ticker);
  }
}

export async function runPriceMonitor(
  date: string,
  marketContext: MarketContext,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore,
  embeddings: EmbeddingClient,
  llmBucket: TokenBucket
): Promise<void> {
  // Clean up stale price history entries
  cleanupPriceHistory();

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

  // For each spike, find ALL agents holding that ticker and let each respond
  for (const spike of spikes) {
    // Refetch pending alerts each iteration to avoid stale data
    const freshAlerts = await db.getPendingAlerts();
    const alert = freshAlerts.find((a) => a.ticker === spike.ticker && !a.processed);
    if (!alert) continue;

    let allAgentsSucceeded = true;
    let anyAgentHeld = false;

    for (const agentRow of agents) {
      const positions = await db.getPositions(agentRow.id);
      const holds = positions.some((p) => p.ticker === spike.ticker);
      if (!holds) continue;

      anyAgentHeld = true;
      const identity = await fileStore.loadIdentity(agentRow.id);
      const params = parseAgentParams(identity);
      const config: AgentConfig = {
        id: agentRow.id,
        name: agentRow.name,
        initialCash: Number(agentRow.initial_cash),
        ...params,
      };

      const trader = new TraderAgent(agentRow.id, config, db, fmp, fileStore, embeddings, llmBucket);
      try {
        await trader.respondToAlert(
          { id: alert.id, ticker: alert.ticker, pct_change: Number(alert.pct_change), price: Number(alert.price), alert_type: alert.alert_type },
          marketContext
        );
      } catch (e) {
        console.error(`[priceMonitor] Agent ${agentRow.id} alert response failed:`, (e as Error).message);
        allAgentsSucceeded = false;
      }
    }

    // Mark processed if all holding agents succeeded, or if no agent held the ticker
    if (allAgentsSucceeded || !anyAgentHeld) {
      await db.markAlertProcessed(alert.id);
    } else {
      console.warn(`[priceMonitor] Alert ${alert.id} (${alert.ticker}) NOT marked processed — will retry next cycle`);
    }
  }
}
