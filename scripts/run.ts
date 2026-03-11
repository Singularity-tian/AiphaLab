#!/usr/bin/env tsx
/**
 * Manually advance the simulation by one trading day (backward compat).
 * Usage: tsx scripts/run.ts [--date YYYY-MM-DD] [--dry-run]
 */

import "dotenv/config";
import { SimDB } from "../lib/db/repository";
import { getFmp } from "../lib/fmp";
import { getFileStore } from "../lib/fileStore";
import { getEmbeddingClient } from "../lib/embeddings";
import { TraderAgent, MarketContext, AgentConfig } from "../lib/agent";
import { createTokenBucket } from "../daemon/rateLimiter";
import { computeBatchSignals } from "../lib/signals";

const args = process.argv.slice(2);
const dateArg = args.indexOf("--date");
const targetDate = dateArg !== -1 ? args[dateArg + 1] : new Date().toISOString().split("T")[0];
const dryRun = args.includes("--dry-run");

async function buildMarketContext(date: string, fmp: ReturnType<typeof getFmp>): Promise<MarketContext> {
  try {
    const spyHistory = await fmp.getDailyOHLC("SPY", "", date);
    const sorted = spyHistory.sort((a: any, b: any) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const prev1 = sorted[sorted.length - 2];
    const prev5 = sorted[sorted.length - 6];
    const ret1d = prev1 ? (last.close - prev1.close) / prev1.close : 0;
    const ret5d = prev5 ? (last.close - prev5.close) / prev5.close : 0;
    const regime: MarketContext["marketRegime"] =
      ret5d > 0.02 ? "trending_up" : ret5d < -0.02 ? "trending_down" : "choppy";
    return { date, spyReturn1d: ret1d, spyReturn5d: ret5d, vixLevel: null, marketRegime: regime };
  } catch {
    return { date, spyReturn1d: 0, spyReturn5d: 0, vixLevel: null, marketRegime: "choppy" };
  }
}

async function main() {
  const db = new SimDB();
  const agents = await db.getAllAgents();

  if (agents.length === 0) {
    console.error("No agents found. Run: pnpm seed -- --n 5");
    process.exit(1);
  }

  if (dryRun) {
    const last = await db.getLastSimLog();
    console.log(`DRY RUN: Would advance from ${last?.date ?? "none"} to ${targetDate}`);
    console.log(`Agents: ${agents.length}`);
    process.exit(0);
  }

  console.log(`\nAiphaLab — Running ${targetDate} (${agents.length} agents)...\n`);

  const fmp = getFmp();
  const fileStore = getFileStore();
  const embeddings = getEmbeddingClient();
  const llmBucket = createTokenBucket(40);

  const marketContext = await buildMarketContext(targetDate, fmp);
  console.log(`Market context: ${marketContext.marketRegime}, SPY ${(marketContext.spyReturn1d * 100).toFixed(2)}%\n`);

  // Pre-compute signals for all unique tickers
  const allTickers = new Set<string>();
  // (Would need to read strategy files, but for simplicity use empty cache here)
  const cachedSignals: Record<string, any> = {};

  await db.insertSimLog({
    date: targetDate,
    started_at: new Date().toISOString(),
    finished_at: null,
    agents_processed: 0,
    market_open: true,
  });

  let processed = 0;
  const errors: string[] = [];

  // Process in batches of 5
  for (let i = 0; i < agents.length; i += 5) {
    const chunk = agents.slice(i, i + 5);
    await Promise.all(
      chunk.map(async (agentRow) => {
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
          await trader.runDay(marketContext);
          processed++;
        } catch (e) {
          errors.push(`Agent ${agentRow.id}: ${(e as Error).message}`);
        }
      })
    );
    process.stdout.write(`\r  Processed: ${processed}/${agents.length}`);
  }

  await db.finishSimLog(targetDate, processed);

  console.log(`\n\nDone: ${processed} agents processed.`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.forEach((e) => console.log("  -", e));
  }

  // Print top 10
  const lb = await db.getLeaderboard(10);
  if (lb.length > 0) {
    console.log("\nTop 10 Traders:");
    lb.forEach((r, i) => {
      const pct = ((r.cumulative_return ?? 0) * 100).toFixed(1);
      const sign = (r.cumulative_return ?? 0) >= 0 ? "+" : "";
      console.log(`  ${String(i + 1).padStart(2)}. ${r.name.padEnd(25)} ${sign}${pct}%`);
    });
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
