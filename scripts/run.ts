#!/usr/bin/env tsx
/**
 * Advance the simulation by one trading day.
 * Usage: tsx scripts/run.ts [--date YYYY-MM-DD] [--dry-run]
 */

import "dotenv/config";
import { SimDB } from "../lib/db/repository";
import { getFmp } from "../lib/fmp";
import { DailyOrchestrator } from "../lib/orchestrator";

const args = process.argv.slice(2);
const dateArg = args.indexOf("--date");
const targetDate = dateArg !== -1 ? args[dateArg + 1] : undefined;
const dryRun = args.includes("--dry-run");

async function main() {
  const db = new SimDB();
  const agentCount = db.getAllAgents().length;

  if (agentCount === 0) {
    console.error("No agents found. Run: tsx scripts/seed.ts --n 5");
    process.exit(1);
  }

  const fmp = getFmp();
  const orchestrator = new DailyOrchestrator(db, fmp);

  if (dryRun) {
    const last = db.getLastSimLog();
    console.log(`DRY RUN: Would advance from ${last?.date ?? "none"}`);
    console.log(`Agents: ${agentCount}`);
    process.exit(0);
  }

  console.log(`\n🚀 AiphaLab — Running simulation${targetDate ? ` for ${targetDate}` : ""}...\n`);
  console.log(`Agents: ${agentCount}`);

  const result = await orchestrator.advanceDay(targetDate);
  console.log("\n" + result.summary());

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((e) => console.log("  •", e));
  }

  // Print leaderboard
  const lb = orchestrator.getLeaderboard(10);
  if (lb.length > 0) {
    console.log("\n📊 Top 10 Traders:");
    lb.forEach((r: any, i: number) => {
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
