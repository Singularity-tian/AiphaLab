#!/usr/bin/env tsx
/**
 * Seed the simulation with trader personas + agent soul files.
 * Usage: tsx scripts/seed.ts [--n 5]
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { SimDB } from "../lib/db/repository";
import { FileStore, PgFileStore } from "../lib/fileStore";
import { generateAllPersonas, formatIdentityMd, formatStrategyMd } from "../lib/persona";

const args = process.argv.slice(2);
const nArg = args.indexOf("--n");
const n = nArg !== -1 ? parseInt(args[nArg + 1], 10) : 100;

async function main() {
  console.log(`\nSeeding AiphaLab with ${n} traders...\n`);

  const db = new SimDB();
  const fileStore = new FileStore();
  // Also write to Postgres if FILESTORE_BACKEND=pg (or both)
  const pgStore = process.env.DATABASE_URL ? new PgFileStore() : null;

  // Check if already seeded
  const existing = await db.getAllAgents();
  if (existing.length > 0) {
    console.log(`DB already has ${existing.length} agents. Run with a fresh DB to re-seed.`);
    process.exit(0);
  }

  // Generate personas
  console.log("Generating personas...");
  const personas = await generateAllPersonas(n);
  console.log(`Generated ${personas.length} personas.\n`);

  // Insert each agent into DB + create soul files
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];

    // Insert minimal DB row (no persona_json — soul is in files)
    const id = await db.insertAgent({
      name: persona.name,
      initial_cash: 100_000,
      is_active: true,
    });

    // Initialize agent state
    await db.upsertAgentState({
      agent_id: id,
      cash: 100_000,
      portfolio_value: 100_000,
      total_pnl: 0,
      last_run_date: null,
      run_count: 0,
    });

    // Write soul files to local fs (for git/dev inspection)
    const identity = formatIdentityMd(persona);
    const strategy = formatStrategyMd(persona);
    await fileStore.initializeAgentDir(id, identity, strategy, {});

    // Also write to Postgres agent_docs (for Vercel+Railway prod)
    if (pgStore) {
      await pgStore.initializeAgentDir(id, identity, strategy, {});
    }

    if ((i + 1) % 10 === 0 || i === personas.length - 1) {
      console.log(`  Created ${i + 1}/${personas.length} agents...`);
    }
  }

  console.log(`\nSeeded ${personas.length} traders.\n`);

  // Verify
  const all = await db.getAllAgents();
  console.log("Sample agents:");
  for (const a of all.slice(0, 5)) {
    console.log(`  [${a.id}] ${a.name}`);
  }

  console.log("\nVerify soul files:");
  console.log(`  ls data/agents/agent_001/`);
  console.log("\nNext steps:");
  console.log("  pnpm daemon -- --phase marketOpen --date 2025-01-06");
  console.log("  pnpm dev\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
