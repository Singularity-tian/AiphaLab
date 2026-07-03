import { getStockBundle } from "@/lib/stockData";
import { getFmp, type FundamentalsTTM } from "@/lib/fmp";
import type { SimDB } from "@/lib/db/repository";
import {
  LENSES,
  buildLensPrompt,
  buildSynthesisPrompt,
  SYNTHESIS_MODEL,
  SYNTHESIS_MAX_TOKENS,
  DISCLAIMER,
  type ResearchBundle,
} from "./lenses";

export type GenerateFn = (
  prompt: string,
  systemPrompt: string,
  temperature: number,
  model: string,
  maxTokens: number
) => Promise<string>;

/**
 * Runs the full research panel for one report row. Never throws: the row
 * always ends 'complete' or 'failed'.
 *
 * Execution model: the POST route only inserts the row; the daemon's research
 * worker (daemon/researchWorker.ts) polls for unprocessed rows and calls this
 * with an llmBucket-wrapped generateFn. Nothing depends on post-response
 * execution, so this works on serverless deployments too.
 */
export async function runResearchReport(
  db: SimDB,
  reportId: number,
  ticker: string,
  // No default on purpose: production callers must pass an llmBucket-wrapped
  // GenerateFn (see daemon/researchWorker.ts); tests pass stubs. A raw
  // `generate` default would silently bypass daemon rate limiting.
  generateFn: GenerateFn
): Promise<void> {
  try {
    const base = await getStockBundle(ticker);
    if (!base) {
      await db.failResearchReport(reportId, `Ticker "${ticker}" not found`);
      return;
    }

    // Peer comparables for the valuation lens (top 4, each degrades to null).
    const peerSymbols = base.peers.slice(0, 4).map((p) => p.symbol);
    const fmp = getFmp();
    const peerResults = await Promise.all(
      peerSymbols.map((s) => fmp.getFundamentalsTTM(s).catch(() => null))
    );
    const peerFundamentals: Record<string, FundamentalsTTM | null> = {};
    peerSymbols.forEach((s, i) => (peerFundamentals[s] = peerResults[i]));

    const bundle: ResearchBundle = { ...base, peerFundamentals };
    const lensPrompt = buildLensPrompt(bundle);

    // 4 lenses in parallel; individual failures survive as gaps.
    const lensResults = await Promise.allSettled(
      LENSES.map((l) => generateFn(lensPrompt, l.systemPrompt, 0.7, l.model, l.maxTokens))
    );
    const lensOutputs: Record<string, string> = {};
    const failedLenses: string[] = [];
    let firstLensError: string | null = null;
    LENSES.forEach((l, i) => {
      const r = lensResults[i];
      if (r.status === "fulfilled") lensOutputs[l.key] = r.value;
      else {
        failedLenses.push(l.key);
        if (!firstLensError) firstLensError = String(r.reason);
        console.error(`[research] lens ${l.key} failed for ${ticker}: ${String(r.reason)}`);
      }
    });
    if (Object.keys(lensOutputs).length === 0) {
      // Surface the underlying cause — a bare "all lenses failed" hides
      // whether it was auth, rate limits, or a killed deploy instance.
      await db.failResearchReport(
        reportId,
        `All research lenses failed — ${String(firstLensError).slice(0, 300)}`
      );
      return;
    }

    const synthesis = await generateFn(
      buildSynthesisPrompt(ticker, lensOutputs, failedLenses),
      "You are a precise financial editor writing for beginners.",
      0.5,
      SYNTHESIS_MODEL,
      SYNTHESIS_MAX_TOKENS
    );

    const reportMd = `${synthesis.trim()}\n\n---\n\n*${DISCLAIMER}*`;
    await db.completeResearchReport(reportId, reportMd, lensOutputs, bundle);
  } catch (e) {
    console.error(`[research] report ${reportId} (${ticker}) failed: ${String(e)}`);
    try {
      await db.failResearchReport(reportId, String(e).slice(0, 500));
    } catch (dbErr) {
      console.error(`[research] could not mark report ${reportId} failed: ${String(dbErr)}`);
    }
  }
}
