#!/usr/bin/env tsx
/**
 * Seed the simulation database with trader personas.
 * Usage: tsx scripts/seed.ts [--n 5]
 */

import "dotenv/config";
import { SimDB } from "../lib/db/repository";
import { generateAllPersonas } from "../lib/persona";

const args = process.argv.slice(2);
const nArg = args.indexOf("--n");
const n = nArg !== -1 ? parseInt(args[nArg + 1], 10) : 100;

const STRATEGIES = ["graham_value", "momentum", "blended"];

async function main() {
  console.log(`\n🌱 Seeding AiphaLab with ${n} traders...\n`);

  const db = new SimDB();

  // Check if already seeded
  const existing = db.getAllAgents();
  if (existing.length > 0) {
    console.log(`DB already has ${existing.length} agents. Run with a fresh DB to re-seed.`);
    process.exit(0);
  }

  // Generate personas
  console.log("Generating personas...");
  const personas = await generateAllPersonas(n, STRATEGIES);
  console.log(`Generated ${personas.length} personas.\n`);

  // Insert into DB
  const now = new Date().toISOString();
  for (const persona of personas) {
    const id = db.insertAgent({
      name: persona.name,
      persona_json: JSON.stringify(persona),
      strategy_name: persona.preferredStrategy,
      initial_cash: 100_000,
      created_at: now,
      is_active: 1,
    });

    db.upsertAgentState({
      agent_id: id,
      cash: 100_000,
      portfolio_value: 100_000,
      total_pnl: 0,
      last_run_date: null,
      run_count: 0,
    });
  }

  console.log(`✅ Seeded ${personas.length} traders into the database.\n`);
  console.log("Sample traders:");
  const sample = db.getAllAgents().slice(0, 5);
  for (const a of sample) {
    const p = JSON.parse(a.persona_json);
    console.log(`  [${a.id}] ${a.name} | ${a.strategy_name} | risk: ${p.riskTolerance}`);
  }

  console.log("\nNext step: tsx scripts/run.ts --date 2025-01-02\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
