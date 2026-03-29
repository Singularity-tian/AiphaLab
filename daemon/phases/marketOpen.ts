/**
 * Market Open Phase (09:35 ET Mon-Fri)
 * Load cached signals, run runDecisionPhase() for each agent.
 * LLM calls ≤ 100. Writes: trades, positions, beliefs.json.
 */

import chunk from "lodash/chunk";
import { SimDB } from "../../lib/db/repository";
import { FMPClient } from "../../lib/fmp";
import { SimulatedBroker } from "../../lib/broker";
import { type IFileStore } from "../../lib/fileStore";
import { EmbeddingClient } from "../../lib/embeddings";
import { TraderAgent, MarketContext, AgentConfig, parseAgentParams } from "../../lib/agent";
import { TokenBucket } from "../rateLimiter";
import { getSignalCache, runPreMarket } from "./preMarket";

async function processAgentsInPhase(
  phase: string,
  date: string,
  agents: { id: number }[],
  db: SimDB,
  processFn: (agentId: number) => Promise<void>
): Promise<void> {
  const existing = await db.getPhaseLog(phase, date);
  const lastId = existing?.last_agent_id ?? null;
  const startIdx = lastId ? agents.findIndex((a) => a.id === lastId) + 1 : 0;

  if (!existing) await db.insertPhaseLog(phase, date);

  const remaining = agents.slice(startIdx);
  for (const batch of chunk(remaining, 5)) {
    await Promise.all(batch.map((a) => processFn(a.id)));
    await db.updatePhaseLogProgress(phase, date, batch[batch.length - 1].id);
  }

  await db.finishPhaseLog(phase, date, agents.length);
}

export async function runMarketOpen(
  date: string,
  marketContext: MarketContext,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore,
  embeddings: EmbeddingClient,
  llmBucket: TokenBucket
): Promise<void> {
  console.log(`[marketOpen] ${date} — Starting trading decisions...`);

  const agents = await db.getAllAgents();
  let cache = getSignalCache();

  if (!cache || cache.date !== date) {
    console.warn(`[marketOpen] No preMarket cache for ${date}. Running on-demand signal computation...`);
    try {
      cache = await runPreMarket(date, db, fmp, fileStore);
    } catch (e) {
      console.error(`[marketOpen] On-demand preMarket failed: ${(e as Error).message}. Proceeding with empty signals.`);
    }
  }

  const signals = cache?.date === date ? cache.signals : {};

  let tradesTotal = 0;

  await processAgentsInPhase("marketOpen", date, agents, db, async (agentId) => {
    const agentRow = agents.find((a) => a.id === agentId)!;
    const identity = await fileStore.loadIdentity(agentRow.id);
    const params = parseAgentParams(identity);
    const config: AgentConfig = {
      id: agentRow.id,
      name: agentRow.name,
      initialCash: Number(agentRow.initial_cash),
      ...params,
    };

    const trader = new TraderAgent(agentId, config, db, fmp, fileStore, embeddings, llmBucket);
    try {
      const { tradesExecuted } = await trader.runDecisionPhase(marketContext, signals);
      tradesTotal += tradesExecuted;

      // Always update agent_state so leaderboard reflects current portfolio values
      const broker = await SimulatedBroker.fromDB(agentId, db);
      const portfolioValue = await broker.getPortfolioValue(date, fmp);
      const prevState = await db.getAgentState(agentId);
      await db.upsertAgentState({
        agent_id: agentId,
        cash: broker.cash,
        portfolio_value: portfolioValue,
        total_pnl: portfolioValue - config.initialCash,
        last_run_date: date,
        run_count: prevState?.run_count ?? 0,
      });
    } catch (e) {
      console.error(`[marketOpen] Agent ${agentId} failed:`, (e as Error).message);
    }
  });

  console.log(`[marketOpen] Done — ${tradesTotal} trades executed across ${agents.length} agents.`);
}
