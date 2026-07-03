import { getStockBundle } from "@/lib/stockData";
import { getFmp, type FundamentalsTTM } from "@/lib/fmp";
import { generate } from "@/lib/llm";
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
 * NOTE (serverless): this is fire-and-forgotten by the POST route. On Vercel,
 * work after the response may be killed — acceptable for local/dev use. If
 * reports are needed in production, move this call into the daemon (poll a
 * research_requests queue); the API contract does not change.
 */
export async function runResearchReport(
  db: SimDB,
  reportId: number,
  ticker: string,
  generateFn: GenerateFn = generate
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
    LENSES.forEach((l, i) => {
      const r = lensResults[i];
      if (r.status === "fulfilled") lensOutputs[l.key] = r.value;
      else {
        failedLenses.push(l.key);
        console.error(`[research] lens ${l.key} failed for ${ticker}: ${String(r.reason)}`);
      }
    });
    if (Object.keys(lensOutputs).length === 0) {
      await db.failResearchReport(reportId, "All research lenses failed");
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
