/**
 * Midday Phase (12:30 ET Mon-Fri)
 * Re-fetch prices, update trailing stops. Stop-loss only — no LLM calls.
 * LLM calls: 0. Writes: positions, beliefs.
 */

import { SimDB } from "../../lib/db/repository";
import { FMPClient } from "../../lib/fmp";
import { type IFileStore } from "../../lib/fileStore";
import { SimulatedBroker } from "../../lib/broker";
import { MarketContext } from "../../lib/agent";

export async function runMidday(
  date: string,
  marketContext: MarketContext,
  db: SimDB,
  fmp: FMPClient,
  fileStore: IFileStore
): Promise<void> {
  console.log(`[midday] ${date} — Running stop-loss rescan...`);

  const agents = await db.getAllAgents();
  let stopsFired = 0;

  for (const agentRow of agents) {
    try {
      const broker = await SimulatedBroker.fromDB(agentRow.id, db);
      if (broker.positions.size === 0) continue;

      const results = await broker.checkStopLosses(date, fmp, 0.2, "midday");
      const sold = results.filter((r) => r.success);

      if (sold.length > 0) {
        await broker.persistToDB(db, date);
        stopsFired += sold.length;

        // Update beliefs for sold positions
        for (const r of sold) {
          await fileStore.updateTickerBelief(agentRow.id, r.ticker, {
            sentiment: "bearish",
            notes: `Stop-loss triggered at midday: ${r.price.toFixed(2)}`,
          });
        }
      }
    } catch (e) {
      console.error(`[midday] Agent ${agentRow.id} failed:`, (e as Error).message);
    }
  }

  console.log(`[midday] Done — ${stopsFired} stop-losses fired.`);
}
