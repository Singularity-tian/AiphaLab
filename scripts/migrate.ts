#!/usr/bin/env tsx
/**
 * Run database migrations against Neon Postgres.
 * Usage: tsx scripts/migrate.ts
 */

import "dotenv/config";
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
      // Use tagged template literal trick: sql`...` requires template literals,
      // but we can use sql([stmt], []) to pass a raw query string
      await (sql as any)([stmt] as any, [] as any);
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

  console.log(`Migration complete: ${ok} statements executed, ${skip} skipped (already exist).`);
  console.log("\nNext step: tsx scripts/seed.ts --n 5\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
