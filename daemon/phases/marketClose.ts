/**
 * Market Close Phase (15:55 ET Mon-Fri)
 * Final mark-to-market, write daily_snapshots, update agent_state.
 * No LLM calls. No file writes.
 */

import { SimDB } from "../../lib/db/repository";
import { FMPClient } from "../../lib/fmp";
import { SimulatedBroker } from "../../lib/broker";

export async function runMarketClose(
  date: string,
  db: SimDB,
  fmp: FMPClient
): Promise<void> {
  console.log(`[marketClose] ${date} — Writing EOD snapshots...`);

  const agents = await db.getAllAgents();
  let processed = 0;

  for (const agentRow of agents) {
    try {
      // Skip if snapshot already written today
      const existing = await db.hasSnapshot(agentRow.id, date);
      if (existing) { processed++; continue; }

      const broker = await SimulatedBroker.fromDB(agentRow.id, db);
      const portfolioValue = await broker.getPortfolioValue(date, fmp);
      const positionValue = portfolioValue - broker.cash;

      const prevSnapshot = await db.getLatestSnapshot(agentRow.id);
      const prevValue = prevSnapshot?.portfolio_value
        ? Number(prevSnapshot.portfolio_value)
        : Number(agentRow.initial_cash);

      const dailyReturn = prevValue > 0 ? (portfolioValue - prevValue) / prevValue : 0;
      const cumulativeReturn = (portfolioValue - Number(agentRow.initial_cash)) / Number(agentRow.initial_cash);

      await db.insertSnapshot({
        agent_id: agentRow.id,
        date,
        portfolio_value: portfolioValue,
        cash: broker.cash,
        position_value: positionValue,
        num_positions: broker.positions.size,
        daily_return: dailyReturn,
        cumulative_return: cumulativeReturn,
      });

      await db.upsertAgentState({
        agent_id: agentRow.id,
        cash: broker.cash,
        portfolio_value: portfolioValue,
        total_pnl: portfolioValue - Number(agentRow.initial_cash),
        last_run_date: date,
        run_count: (await db.getAgentState(agentRow.id))?.run_count ?? 0,
      });

      processed++;
    } catch (e) {
      console.error(`[marketClose] Agent ${agentRow.id} failed:`, (e as Error).message);
    }
  }

  console.log(`[marketClose] Done — ${processed}/${agents.length} snapshots written.`);
}
