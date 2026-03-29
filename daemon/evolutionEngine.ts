/**
 * Evolution Engine — weekly LLM-driven strategy rewrite.
 * Runs Sunday 20:00 ET. Classifies agents, rewrites strategy.md (and lightly edits identity.md).
 */

import crypto from "crypto";
import { SimDB } from "../lib/db/repository";
import { type IFileStore } from "../lib/fileStore";
import { TokenBucket } from "./rateLimiter";
import { generate } from "../lib/llm";

const EVOLUTION_CAP = 20; // max agents to evolve per week
const MIN_TRADING_DAYS = 20;
const UNDERPERFORM_RETURN = -0.10;
const UNDERPERFORM_RANK = 50;
const OVERPERFORM_RETURN = 0.15;
const OVERPERFORM_RANK = 75;

export async function runEvolutionEngine(
  date: string,
  db: SimDB,
  fileStore: IFileStore,
  llmBucket: TokenBucket
): Promise<void> {
  const agents = await db.getAllAgents();
  console.log(`[evolution] Evaluating ${agents.length} agents...`);

  const classified: Array<{
    agentId: number;
    type: "underperformer" | "overperformer";
    perf: Awaited<ReturnType<SimDB["getAgentPerformanceWindow"]>>;
  }> = [];

  for (const agent of agents) {
    const perf = await db.getAgentPerformanceWindow(agent.id, 35);
    if (!perf || perf.days < MIN_TRADING_DAYS) continue;

    if (perf.cumulativeReturn < UNDERPERFORM_RETURN && perf.rank < UNDERPERFORM_RANK) {
      classified.push({ agentId: agent.id, type: "underperformer", perf });
    } else if (perf.cumulativeReturn > OVERPERFORM_RETURN && perf.rank > OVERPERFORM_RANK) {
      classified.push({ agentId: agent.id, type: "overperformer", perf });
    }
  }

  // Cap to prevent mass mutation
  const toEvolve = classified.slice(0, EVOLUTION_CAP);
  console.log(`[evolution] ${classified.length} classified, evolving ${toEvolve.length} (cap: ${EVOLUTION_CAP})`);

  for (const { agentId, type, perf } of toEvolve) {
    await llmBucket.waitForToken();
    try {
      await evolveAgent(agentId, type, perf!, db, fileStore, date);
    } catch (e) {
      console.error(`[evolution] Agent ${agentId} evolution failed:`, (e as Error).message);
    }
  }
}

async function evolveAgent(
  agentId: number,
  type: "underperformer" | "overperformer",
  perf: NonNullable<Awaited<ReturnType<SimDB["getAgentPerformanceWindow"]>>>,
  db: SimDB,
  fileStore: IFileStore,
  date: string
): Promise<void> {
  const [currentStrategy, currentIdentity, recentJournals] = await Promise.all([
    fileStore.loadStrategy(agentId),
    fileStore.loadIdentity(agentId),
    fileStore.loadRecentJournals(agentId, 5),
  ]);

  const oldStrategyHash = crypto.createHash("md5").update(currentStrategy).digest("hex");
  const oldIdentityHash = crypto.createHash("md5").update(currentIdentity).digest("hex");

  const perfSummary = `
Performance (last ${perf.days} days):
- Cumulative return: ${(perf.cumulativeReturn * 100).toFixed(1)}%
- Max drawdown: ${(perf.maxDrawdown * 100).toFixed(1)}%
- Win rate: ${(perf.winRate * 100).toFixed(0)}%
- Total trades: ${perf.totalTrades}
- Sharpe ratio: ${perf.sharpeRatio?.toFixed(2) ?? "N/A"}
- Percentile rank: ${perf.rank}th
- Classification: ${type}`;

  // Evolve strategy.md
  const strategyPrompt = `You are an AI trading coach reviewing a trader's performance.

Current strategy:
${currentStrategy}

Current identity (for context):
${currentIdentity}

Recent journals (last 5 days):
${recentJournals.join("\n---\n")}

${perfSummary}

The trader is classified as a ${type} and needs strategy evolution.

${type === "underperformer"
  ? "The strategy is underperforming. Rewrite it to address weaknesses. Be honest about what is not working."
  : "The strategy is outperforming. Refine it to protect gains and build on strengths."}

Rewrite the strategy.md document with these constraints:
- MUST preserve the exact markdown structure (## Watchlist, ## Entry Rules, etc.)
- CAN adjust all numeric thresholds
- CAN add/remove entry/exit rules
- CAN swap 1-3 tickers in the watchlist
- MUST rewrite the "Self-Identified Weaknesses" section
- MUST add an entry to the Strategy Changelog
- Name, age, background are IMMUTABLE

Return the complete new strategy.md content (markdown, no code fences).`;

  const newStrategy = await generate(strategyPrompt, "", 0.6);

  // Validate that the LLM produced a non-trivial strategy
  if (!newStrategy || newStrategy.trim().length < 100) {
    console.error(`[evolution] Agent ${agentId}: LLM returned empty/tiny strategy (${newStrategy?.length ?? 0} chars) — skipping`);
    return;
  }

  await fileStore.writeStrategy(agentId, newStrategy);

  const newStrategyHash = crypto.createHash("md5").update(newStrategy).digest("hex");

  await db.insertEvolutionLog({
    agentId,
    trigger: type,
    fieldChanged: "strategy.md",
    oldHash: oldStrategyHash,
    newHash: newStrategyHash,
    cumulativeReturnBefore: perf.cumulativeReturn,
    rationale: `${type}: return=${(perf.cumulativeReturn * 100).toFixed(1)}%, rank=${perf.rank}th`,
  });

  // Light identity evolution (adjust parameters only)
  const identityPrompt = `You are reviewing a trader's identity parameters after performance review.

Current identity:
${currentIdentity}

${perfSummary}

Make MINOR adjustments to the identity's Parameters section only:
- decision_temperature: can shift ±0.1 (range: 0.1–0.95)
- conviction_multiplier: can shift ±0.2 (range: 0.3–2.5)
- Can add or remove ONE personality trait
- Name, age, background, quirks are IMMUTABLE

Return the complete updated identity.md (markdown, no code fences).`;

  const newIdentity = await generate(identityPrompt, "", 0.4);

  // Validate that the LLM produced a non-trivial identity
  if (!newIdentity || newIdentity.trim().length < 100) {
    console.error(`[evolution] Agent ${agentId}: LLM returned empty/tiny identity (${newIdentity?.length ?? 0} chars) — skipping identity update`);
    return;
  }

  await fileStore.writeIdentity(agentId, newIdentity);

  const newIdentityHash = crypto.createHash("md5").update(newIdentity).digest("hex");

  await db.insertEvolutionLog({
    agentId,
    trigger: type,
    fieldChanged: "identity.md",
    oldHash: oldIdentityHash,
    newHash: newIdentityHash,
    cumulativeReturnBefore: perf.cumulativeReturn,
    rationale: "Parameter adjustment after strategy evolution",
  });

  console.log(`[evolution] Agent ${agentId} evolved (${type}): strategy + identity updated`);
}
