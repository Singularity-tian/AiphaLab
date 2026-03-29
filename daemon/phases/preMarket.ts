/**
 * Pre-Market Phase (09:00 ET Mon-Fri)
 * Fetch all watchlist quotes + financial ratios, compute signals, cache in memory.
 * No LLM calls. No file writes.
 */

import { SimDB } from "../../lib/db/repository";
import { FMPClient } from "../../lib/fmp";
import { type IFileStore } from "../../lib/fileStore";
import { computeBatchSignals, SignalResult } from "../../lib/signals";
import { SP500_UNIVERSE, TICKER_STOPWORDS } from "../../lib/persona";

const VALID_TICKERS = new Set(SP500_UNIVERSE);

export interface PreMarketCache {
  date: string;
  signals: Record<string, SignalResult>;
  cachedAt: number;
}

let _cache: PreMarketCache | null = null;

export function getSignalCache(): PreMarketCache | null {
  return _cache;
}

export async function runPreMarket(
  date: string,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore
): Promise<PreMarketCache> {
  console.log(`[preMarket] ${date} — Starting signal computation...`);

  const agents = await db.getAllAgents();

  // Collect all unique tickers across all agent strategy files
  const allTickers = new Set<string>();
  for (const agent of agents) {
    try {
      const strategy = await fileStore.loadStrategy(agent.id);
      // Extract ticker-like tokens (all-caps, 1-5 chars)
      const matches = strategy.match(/\b[A-Z]{1,5}\b/g) ?? [];
      for (const t of matches) {
        if (VALID_TICKERS.has(t) && !TICKER_STOPWORDS.has(t)) allTickers.add(t);
      }
    } catch {
      // Agent files not created yet, skip
    }
  }

  const tickers = Array.from(allTickers).slice(0, 200); // cap at 200
  console.log(`[preMarket] Computing signals for ${tickers.length} unique tickers...`);

  const rawSignals = await computeBatchSignals(tickers, date, fmp);

  // Filter out tickers where FMP returned no data (confidence === 0)
  const signals: Record<string, SignalResult> = {};
  let filtered = 0;
  for (const [t, s] of Object.entries(rawSignals)) {
    if (s.confidence > 0) {
      signals[t] = s;
    } else {
      filtered++;
    }
  }

  _cache = { date, signals, cachedAt: Date.now() };
  console.log(`[preMarket] Done — ${Object.keys(signals).length} signals computed${filtered > 0 ? `, ${filtered} tickers filtered (no data)` : ""}.`);

  return _cache;
}
