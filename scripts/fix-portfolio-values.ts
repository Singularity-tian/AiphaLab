#!/usr/bin/env tsx
/**
 * Fix corrupted portfolio values caused by the cash double-counting bug.
 *
 * The bug: broker.persistToDB() didn't save updated cash to agent_state,
 * so subsequent broker.fromDB() loaded stale cash, inflating portfolio value.
 * Additionally, cash_after in the trades table is corrupted on day 2+.
 *
 * Fix approach: replay all trades from initial_cash to derive correct cash,
 * then recompute snapshots and agent_state.
 *
 * Usage: pnpm tsx scripts/fix-portfolio-values.ts [--dry-run]
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { SimDB } from "../lib/db/repository";
import { FMPClient } from "../lib/fmp";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const db = new SimDB();
  const fmp = new FMPClient();

  const agents = await db.getAllAgents();
  console.log(`Fixing portfolio values for ${agents.length} agents${dryRun ? " (DRY RUN)" : ""}...\n`);

  for (const agent of agents) {
    const agentId = agent.id;
    const initialCash = Number(agent.initial_cash);

    // Get all trades in chronological order (getTrades returns DESC, so reverse)
    const tradesDesc = await db.getTrades(agentId, 10000);
    const trades = [...tradesDesc].reverse(); // now ASC by date, id
    const positions = await db.getPositions(agentId);

    // Replay all trades to compute correct cash + per-trade cash_after
    let cash = initialCash;
    const cashAfterByTradeId = new Map<number, number>();
    // Also track cash at end of each date for snapshot repair
    const cashByDate = new Map<string, number>();

    for (const t of trades) {
      const shares = Number(t.shares);
      const price = Number(t.price);
      const commission = Number(t.commission);

      if (t.side === "BUY") {
        cash -= shares * price + commission;
      } else {
        cash += shares * price - commission;
      }

      cashAfterByTradeId.set(t.id, cash);
      cashByDate.set(t.date, cash);
    }

    const correctCash = cash;

    // Fetch current market prices for open positions
    const tickers = positions.map((p) => p.ticker);
    const quotes = tickers.length > 0 ? await fmp.getBatchQuotes(tickers) : {};

    let positionValue = 0;
    console.log(`Agent ${agentId} (${agent.name}):`);
    if (positions.length > 0) {
      console.log(`  ${"Ticker".padEnd(8)} ${"Shares".padEnd(8)} ${"Entry".padEnd(12)} ${"Current".padEnd(12)} ${"Mkt Value".padEnd(12)}`);
      for (const pos of positions) {
        const entryPrice = Number(pos.entry_price);
        const shares = Number(pos.shares);
        const currentPrice = quotes[pos.ticker]?.price ?? entryPrice;
        const mktValue = currentPrice * shares;
        positionValue += mktValue;
        console.log(
          `  ${pos.ticker.padEnd(8)} ${String(shares).padEnd(8)} $${entryPrice.toFixed(2).padEnd(11)} $${currentPrice.toFixed(2).padEnd(11)} $${mktValue.toFixed(0).padEnd(11)}`
        );
      }
    }

    const correctPortfolioValue = correctCash + positionValue;
    const correctPnl = correctPortfolioValue - initialCash;

    const state = await db.getAgentState(agentId);
    const oldCash = state?.cash ?? initialCash;
    const oldPortfolio = state?.portfolio_value ?? initialCash;

    console.log(`  Cash:       $${oldCash.toLocaleString()} -> $${correctCash.toFixed(2)}`);
    console.log(`  Positions:  $${positionValue.toFixed(2)}`);
    console.log(`  Portfolio:  $${oldPortfolio.toLocaleString()} -> $${correctPortfolioValue.toFixed(2)}`);
    console.log(`  PnL:        $${(oldPortfolio - initialCash).toLocaleString()} -> $${correctPnl.toFixed(2)}`);

    if (!dryRun) {
      // Fix cash_after in all trade rows
      for (const [tradeId, correctedCashAfter] of cashAfterByTradeId) {
        await db.updateTradeCashAfter(tradeId, correctedCashAfter);
      }

      // Fix agent_state
      await db.upsertAgentState({
        agent_id: agentId,
        cash: correctCash,
        portfolio_value: correctPortfolioValue,
        total_pnl: correctPnl,
        last_run_date: state?.last_run_date ?? "",
        run_count: state?.run_count ?? 0,
      });

      // Recompute all snapshots
      // position_value in snapshots IS correct (stale cash cancels in the subtraction)
      // so we just need correct cash per date
      const snapshots = await db.getSnapshots(agentId);
      let prevValue = initialCash;
      let lastKnownCash = initialCash;

      for (const snap of snapshots) {
        const snapCash = cashByDate.get(snap.date) ?? lastKnownCash;
        lastKnownCash = snapCash;

        const oldPositionValue = Number(snap.position_value);
        const correctedPortfolio = snapCash + oldPositionValue;
        const dailyReturn = prevValue > 0 ? (correctedPortfolio - prevValue) / prevValue : 0;
        const cumulativeReturn = (correctedPortfolio - initialCash) / initialCash;

        await db.insertSnapshot({
          agent_id: agentId,
          date: snap.date,
          portfolio_value: correctedPortfolio,
          cash: snapCash,
          position_value: oldPositionValue,
          num_positions: snap.num_positions,
          daily_return: dailyReturn,
          cumulative_return: cumulativeReturn,
        });

        prevValue = correctedPortfolio;
      }
    }

    console.log("");
  }

  console.log(dryRun ? "Dry run complete. Re-run without --dry-run to apply." : "Done! All portfolio values fixed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
