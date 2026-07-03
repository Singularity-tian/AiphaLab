/**
 * Research worker — daemon-side execution of queued research reports.
 *
 * POST /api/research only inserts a 'running' row; this worker polls for
 * unprocessed rows and runs the lens panel. Running generation here (instead
 * of fire-and-forget in the Next.js API process) survives serverless response
 * termination, resumes orphaned rows after a daemon restart, and routes every
 * research LLM call through the daemon's llmBucket.
 */

import type { SimDB } from "../lib/db/repository";
import { generate } from "../lib/llm";
import { runResearchReport, type GenerateFn } from "../lib/research/generate";
import type { TokenBucket } from "./rateLimiter";

// Reports currently generating in this process — prevents double pickup
// between poll ticks while a report is still in flight.
const inFlight = new Set<number>();

/** Every research LLM call waits for a daemon token before firing. */
function bucketedGenerate(bucket: TokenBucket): GenerateFn {
  return async (prompt, systemPrompt, temperature, model, maxTokens) => {
    await bucket.waitForToken();
    return generate(prompt, systemPrompt, temperature, model, maxTokens);
  };
}

// Deliberate concurrency choice: drain up to this many queued reports per
// tick, processed SEQUENTIALLY (one panel at a time) so concurrent pipelines
// never compete for llmBucket tokens. The daemon's poll guard skips ticks
// while a batch is still running, so a long batch simply delays the next poll.
const RESEARCH_WORKER_BATCH = 3;

export async function runResearchWorker(db: SimDB, llmBucket: TokenBucket): Promise<void> {
  // Atomic claim: exactly one daemon instance wins each report, even during
  // rolling-deploy overlap when two instances poll the same queue.
  const pending = await db.claimResearchReports(RESEARCH_WORKER_BATCH);
  for (const row of pending) {
    if (inFlight.has(row.id)) continue;
    inFlight.add(row.id);
    console.log(`[research] picking up report ${row.id} (${row.ticker})`);
    try {
      // runResearchReport never throws — it always resolves the row's status.
      // The inFlight set stays as belt-and-braces should this loop ever go
      // concurrent again; .finally-style cleanup lives in the finally below.
      await runResearchReport(db, row.id, row.ticker, bucketedGenerate(llmBucket));
    } finally {
      inFlight.delete(row.id);
    }
  }
}
