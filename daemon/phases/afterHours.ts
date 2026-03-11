/**
 * After-Hours Phase (16:30 ET Mon-Fri)
 * Journal generation, episodic memory embedding.
 * LLM calls ≤ 100. Writes: journal/{date}.md, beliefs.json.
 */

import chunk from "lodash/chunk";
import { SimDB } from "../../lib/db/repository";
import { FMPClient } from "../../lib/fmp";
import { type IFileStore } from "../../lib/fileStore";
import { EmbeddingClient } from "../../lib/embeddings";
import { TraderAgent, MarketContext, AgentConfig } from "../../lib/agent";
import { TokenBucket } from "../rateLimiter";

export async function runAfterHours(
  date: string,
  marketContext: MarketContext,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore,
  embeddings: EmbeddingClient,
  llmBucket: TokenBucket
): Promise<void> {
  console.log(`[afterHours] ${date} — Starting journal generation...`);

  const agents = await db.getAllAgents();
  const existing = await db.getPhaseLog("afterHours", date);
  const lastId = existing?.last_agent_id ?? null;
  const startIdx = lastId ? agents.findIndex((a) => a.id === lastId) + 1 : 0;

  if (!existing) await db.insertPhaseLog("afterHours", date);

  const remaining = agents.slice(startIdx);
  let journalsWritten = 0;

  for (const batch of chunk(remaining, 5)) {
    await Promise.all(
      batch.map(async (agentRow) => {
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
          await trader.runReviewPhase(marketContext);
          journalsWritten++;
        } catch (e) {
          console.error(`[afterHours] Agent ${agentRow.id} failed:`, (e as Error).message);
        }
      })
    );
    await db.updatePhaseLogProgress("afterHours", date, batch[batch.length - 1].id);
  }

  await db.finishPhaseLog("afterHours", date, agents.length);
  console.log(`[afterHours] Done — ${journalsWritten} journals written.`);
}
