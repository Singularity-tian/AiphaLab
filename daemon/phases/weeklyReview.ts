/**
 * Weekly Review Phase (Sunday 20:00 ET)
 * Triggers evolution engine for underperforming/overperforming agents.
 */

import { SimDB } from "../../lib/db/repository";
import { type IFileStore } from "../../lib/fileStore";
import { TokenBucket } from "../rateLimiter";
import { runEvolutionEngine } from "../evolutionEngine";

export async function runWeeklyReview(
  db: SimDB,
  fileStore: IFileStore,
  llmBucket: TokenBucket
): Promise<void> {
  console.log(`[weeklyReview] Starting evolution engine...`);
  const date = new Date().toISOString().split("T")[0];

  await runEvolutionEngine(date, db, fileStore, llmBucket);

  console.log(`[weeklyReview] Done.`);
}
