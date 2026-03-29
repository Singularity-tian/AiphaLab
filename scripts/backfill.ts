#!/usr/bin/env tsx
/**
 * Backfill historical trading days for testing.
 * Usage: tsx scripts/backfill.ts --from 2025-01-02 --to 2025-01-31 [--agents 5]
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { SimDB } from "../lib/db/repository";
import { type IFileStore, getFileStore } from "../lib/fileStore";
import { getFmp } from "../lib/fmp";
import { EmbeddingClient, getEmbeddingClient } from "../lib/embeddings";
import { generateStructuredWithRetry } from "../lib/llm";
import { TraderAgent, MarketContext, AgentConfig, parseAgentParams } from "../lib/agent";
import { createTokenBucket } from "../daemon/rateLimiter";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const fromDate = getArg("--from") ?? new Date().toISOString().split("T")[0];
const toDate = getArg("--to") ?? fromDate;
const maxAgents = parseInt(getArg("--agents") ?? "0", 10);

function getBusinessDays(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (current <= end) {
    const dow = current.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function buildMarketContext(date: string, fmp: ReturnType<typeof getFmp>): Promise<MarketContext> {
  try {
    const fromDate = new Date(date);
    fromDate.setDate(fromDate.getDate() - 30);
    const fromStr = fromDate.toISOString().split("T")[0];

    const spyHistory = await fmp.getDailyOHLC("SPY", fromStr, date);
    const sorted = spyHistory.sort((a: any, b: any) => a.date.localeCompare(b.date));
    if (sorted.length < 2) {
      return { date, spyReturn1d: 0, spyReturn5d: 0, vixLevel: null, marketRegime: "choppy" };
    }
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
  const dates = getBusinessDays(fromDate, toDate);
  console.log(`\nBackfilling ${dates.length} days: ${fromDate} → ${toDate}`);

  const db = new SimDB();
  const fmp = getFmp();
  const fileStore = getFileStore();
  const embeddings = getEmbeddingClient();
  const llmBucket = createTokenBucket(40);

  let agents = await db.getAllAgents();
  if (maxAgents > 0) agents = agents.slice(0, maxAgents);

  console.log(`Agents: ${agents.length}\n`);

  for (const date of dates) {
    console.log(`--- ${date} ---`);

    const hasLog = await db.getSimLog(date);
    if (hasLog?.finished_at) {
      console.log(`  Already processed, skipping.`);
      continue;
    }

    const marketContext = await buildMarketContext(date, fmp);
    console.log(`  Regime: ${marketContext.marketRegime}, SPY 1d: ${(marketContext.spyReturn1d * 100).toFixed(2)}%`);

    await db.insertSimLog({
      date,
      started_at: new Date().toISOString(),
      finished_at: null,
      agents_processed: 0,
      market_open: true,
    });

    let processed = 0;
    for (const agentRow of agents) {
      const existing = await db.hasSnapshot(agentRow.id, date);
      if (existing) { processed++; continue; }

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
        await trader.runDay(marketContext);
        processed++;
      } catch (e) {
        console.error(`  Agent ${agentRow.id} failed:`, (e as Error).message);
      }
    }

    await db.finishSimLog(date, processed);
    console.log(`  Done: ${processed}/${agents.length} agents processed.`);
  }

  console.log("\nBackfill complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
