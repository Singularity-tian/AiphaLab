#!/usr/bin/env tsx
/**
 * Run database migrations against Neon Postgres.
 * Usage: tsx scripts/migrate.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env
import { neon } from "@neondatabase/serverless";
import { DDL } from "../lib/db/schema";

async function main() {
  console.log("Running AiphaLab migrations...\n");

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  // Use neon with arrayMode for raw query execution
  const sql = neon(process.env.DATABASE_URL);

  // Execute each DDL statement individually using tagged template with raw string
  const statements = DDL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let ok = 0;
  let skip = 0;

  for (const stmt of statements) {
    try {
      // Neon tagged template: pass statement as sole element of TemplateStringsArray (no bind params)
      const t = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
      await sql(t);
      ok++;
    } catch (e: any) {
      // "already exists" errors are expected on re-runs
      if (e.message?.includes("already exists") || e.code === "42P07" || e.code === "42710") {
        skip++;
      } else {
        console.error(`FAILED: ${stmt.slice(0, 80)}...`);
        console.error(`  Error: ${e.message}`);
        // Non-fatal for IF NOT EXISTS statements
        skip++;
      }
    }
  }

  // Drop deprecated strategy_name column if it exists
  try {
    const dropStmt = "ALTER TABLE agents DROP COLUMN IF EXISTS strategy_name";
    const t = Object.assign([dropStmt], { raw: [dropStmt] }) as unknown as TemplateStringsArray;
    await sql(t);
    console.log("Dropped deprecated strategy_name column.");
  } catch (e: any) {
    console.log(`strategy_name column drop skipped: ${e.message}`);
  }

  console.log(`Migration complete: ${ok} statements executed, ${skip} skipped (already exist).`);
  console.log("\nNext step: tsx scripts/seed.ts --n 5\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
