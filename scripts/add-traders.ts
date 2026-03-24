#!/usr/bin/env tsx
/**
 * Add 20 diverse traders to an existing DB.
 * Unlike seed.ts, this does NOT require a fresh DB.
 *
 * Usage: tsx scripts/add-traders.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { SimDB } from "../lib/db/repository";
import { FileStore, PgFileStore } from "../lib/fileStore";
import {
  ARCHETYPE_CLUSTERS,
  ARCHETYPE_STRATEGY_MAP,
  generatePersonaBatch,
  generateWatchlist,
  formatIdentityMd,
  formatStrategyMdDiverse,
} from "../lib/persona";

const N = 20;

async function main() {
  console.log(`\nAdding ${N} diverse traders to AiphaLab...\n`);

  const db = new SimDB();
  const fileStore = new FileStore();
  const pgStore = process.env.DATABASE_URL ? new PgFileStore() : null;

  // Get current max agent ID so watchlist indices don't collide
  const existing = await db.getAllAgents();
  const maxExistingId = existing.length > 0
    ? Math.max(...existing.map((a) => a.id))
    : 0;
  console.log(`Existing agents: ${existing.length} (max ID: ${maxExistingId})\n`);

  // Generate 20 personas: 10 archetypes × 2 traders each
  console.log("Generating personas (10 archetypes × 2 each)...");
  const allPersonas: Awaited<ReturnType<typeof generatePersonaBatch>> = [];

  for (let cycle = 0; cycle < 2; cycle++) {
    for (let archIdx = 0; archIdx < ARCHETYPE_CLUSTERS.length; archIdx++) {
      if (allPersonas.length >= N) break;

      const cluster = ARCHETYPE_CLUSTERS[archIdx];
      const globalIdx = allPersonas.length;
      const watchlistOffset = maxExistingId + globalIdx;

      console.log(`  [${globalIdx + 1}/${N}] ${cluster} (cycle ${cycle + 1})...`);
      try {
        const batch = await generatePersonaBatch(cluster, watchlistOffset, 1);
        const persona = {
          ...batch[0],
          watchlist: generateWatchlist(watchlistOffset),
        };
        allPersonas.push(persona);
      } catch (e) {
        console.error(`    LLM failed, using fallback persona:`, e);
        allPersonas.push({
          name: `Trader ${watchlistOffset + 1}`,
          age: 30 + (globalIdx % 40),
          background: `Independent trader (${cluster}).`,
          personalityTraits: ["analytical", "disciplined"],
          riskTolerance: (["low", "medium", "high", "reckless"] as const)[globalIdx % 4],
          tradingStyle: ARCHETYPE_STRATEGY_MAP[globalIdx] ?? "garp",
          quirks: ["follows signals strictly"],
          decisionTemperature: 0.3 + (globalIdx % 5) * 0.15,
          convictionMultiplier: 0.5 + (globalIdx % 5) * 0.4,
          description: `A ${cluster.toLowerCase()}.`,
          watchlist: generateWatchlist(watchlistOffset),
        });
      }

      // Small delay between LLM calls
      if (allPersonas.length < N) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Insert each trader into DB + create soul files
  console.log(`\nCreating ${allPersonas.length} agents in DB...\n`);
  const created: { id: number; name: string; template: string }[] = [];

  for (let i = 0; i < allPersonas.length; i++) {
    const persona = allPersonas[i];
    const templateName = ARCHETYPE_STRATEGY_MAP[i] ?? "garp";

    // Insert DB row
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

    // Write soul files
    const identity = formatIdentityMd(persona);
    const strategy = formatStrategyMdDiverse(persona, templateName);
    await fileStore.initializeAgentDir(id, identity, strategy, {});

    if (pgStore) {
      await pgStore.initializeAgentDir(id, identity, strategy, {});
    }

    created.push({ id, name: persona.name, template: templateName });
    console.log(`  [${id}] ${persona.name} (${templateName})`);
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Added ${created.length} traders.\n`);

  const templateCounts: Record<string, number> = {};
  for (const c of created) {
    templateCounts[c.template] = (templateCounts[c.template] ?? 0) + 1;
  }
  console.log("Strategy distribution:");
  for (const [template, count] of Object.entries(templateCounts).sort()) {
    console.log(`  ${template}: ${count}`);
  }

  console.log(`\nTotal agents in DB: ${existing.length + created.length}`);
  console.log("\nNext steps:");
  console.log("  pnpm daemon -- --phase preMarket --date 2026-03-24");
  console.log("  pnpm dev\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
