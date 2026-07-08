import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SimDB } from "@/lib/db/repository";
import { DeskProposalInputSchema, normalizeProposalInput, DEFAULT_ACCOUNT_NAV } from "@/lib/desk";
import { generateStructuredWithRetry } from "@/lib/llm";
import { personalContextForPrompt } from "@/lib/personal";

const RequestSchema = z.object({
  reportId: z.number().int().positive(),
  accountNav: z.number().positive().optional(),
  instrumentType: z.enum(["equity", "option"]).default("equity"),
});

export const ResearchProposalResponseSchema = z.union([
  DeskProposalInputSchema,
  z.object({ proposal: DeskProposalInputSchema }),
]).transform((value) => ("proposal" in value ? value.proposal : value));

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const report = await db.getResearchReport(parsed.data.reportId);
    if (!report) return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    if (report.status !== "complete" || !report.report_md) {
      return NextResponse.json({ error: "report_not_complete" }, { status: 400 });
    }
    const personal = await db.getPersonalDashboard();
    const accountNav = parsed.data.accountNav ?? (personal.metrics.netWorth > 0 ? personal.metrics.netWorth : DEFAULT_ACCOUNT_NAV);
    const personalContext = personalContextForPrompt(personal);

    const proposal = await generateStructuredWithRetry(
      buildPrompt(report.ticker, report.report_md, accountNav, parsed.data.instrumentType, personalContext),
      ResearchProposalResponseSchema,
      0.2,
      undefined,
      "You are a personal CIO converting research into draft-only, human-approved trade proposals that must fit the user's balance sheet, cash reserve, holdings, and risk limits."
    );
    const input = normalizeProposalInput({
      ...proposal,
      ticker: report.ticker,
      accountNav,
      instrumentType: parsed.data.instrumentType,
      researchReportId: report.id,
      sources: [`research:${report.id}`, "personal context", ...(proposal.sources ?? [])],
    });
    const detail = await db.createDeskProposal(input);
    return NextResponse.json(detail, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export function buildPrompt(ticker: string, report: string, accountNav: number, instrumentType: "equity" | "option", personalContext = "{}") {
  const maxLoss = accountNav * 0.005;
  const equityShape = `{
  "ticker": "${ticker}",
  "direction": "long",
  "horizon": "2-8 weeks",
  "catalyst": "specific upcoming or current catalyst from the report",
  "thesis": "20+ word PM-quality thesis",
  "invalidation": "concrete condition that proves the thesis wrong",
  "confidence": 0.6,
  "sources": ["research report"],
  "instrumentType": "equity",
  "entryPrice": 586.14,
  "targetPrice": 640,
  "stopPrice": 560,
  "quantity": 1,
  "maxLoss": 500,
  "accountNav": ${accountNav},
  "rationale": "20+ word rationale explaining why this deserves a draft ticket"
}`;
  const optionShape = `{
  "ticker": "${ticker}",
  "direction": "long",
  "horizon": "2-8 weeks",
  "catalyst": "specific upcoming or current catalyst from the report",
  "thesis": "20+ word PM-quality thesis",
  "invalidation": "concrete condition that proves the thesis wrong",
  "confidence": 0.6,
  "sources": ["research report"],
  "instrumentType": "option",
  "entryPrice": 5,
  "targetPrice": 12,
  "stopPrice": 2.5,
  "quantity": 1,
  "maxLoss": 500,
  "accountNav": ${accountNav},
  "rationale": "20+ word rationale explaining why this deserves a draft ticket",
  "option": {
    "strategy": "debit_spread",
    "expiry": "2026-09-18",
    "strikes": [600, 650],
    "premium": 5,
    "maxGain": 45,
    "breakeven": 605,
    "impliedVolNote": "short note on implied volatility suitability",
    "liquidityNote": "short note on spreads/open interest/limit-order discipline"
  }
}`;
  return `
Convert this completed AlphaLab research report into one structured draft trade proposal for a personal PM desk.

Rules:
- Ticker must be ${ticker}.
- instrumentType must be ${instrumentType}.
- Max loss must be <= ${maxLoss.toFixed(2)} dollars, which is 50 bps of NAV ${accountNav}.
- Include a concrete invalidation condition.
- This is draft-only; do not imply autonomous execution.
- Treat personal fit as binding: cash reserve, monthly surplus, current holdings, concentration, and missing context can justify a tiny tracker size or a defer-style rationale.
- If using options, use only: long_call, long_put, debit_spread, collar, covered_call, protective_put.
- For options, include expiry, strikes, premium, maxGain when knowable, breakeven, impliedVolNote, liquidityNote.
- Return exactly one JSON object. No markdown. No prose.
- Use camelCase keys exactly as shown below.
- Do not wrap the response unless you use {"proposal": <object>}.

Required ${instrumentType} JSON shape:
${instrumentType === "option" ? optionShape : equityShape}

Personal CIO context:
${personalContext}

Research report:
${report.slice(0, 12_000)}
`;
}
