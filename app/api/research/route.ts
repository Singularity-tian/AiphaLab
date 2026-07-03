import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SimDB } from "@/lib/db/repository";
import { getFmp } from "@/lib/fmp";
import { runResearchReport } from "@/lib/research/generate";
import { presentStatus } from "@/lib/research/lenses";

export const dynamic = "force-dynamic";

const db = new SimDB();

const CreateSchema = z.object({
  ticker: z.string().regex(/^[A-Za-z0-9.\-]{1,10}$/),
});

// Fixed-window cap: reports cost ~5-6 LLM calls each. Deliberately
// global per instance (spend guard), unlike /api/stock's per-IP limiter (abuse guard).
// Note: this is per-process — on serverless each warm instance gets its own window;
// dev-mode reloads reset it.
const REPORT_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
let _windowStart = 0;
let _count = 0;

function reportLimited(): boolean {
  const now = Date.now();
  if (now - _windowStart >= WINDOW_MS) {
    _windowStart = now;
    _count = 0;
  }
  if (_count >= REPORT_LIMIT) return true;
  _count++;
  return false;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  const ticker = parsed.data.ticker.toUpperCase();

  if (reportLimited()) {
    return NextResponse.json(
      { error: "Report limit reached (5/hour) — try again later" },
      { status: 429 }
    );
  }

  // Cheap gate before inserting a row: does the symbol exist?
  try {
    const quote = await getFmp().getQuote(ticker);
    if (!quote) {
      return NextResponse.json({ error: `Ticker "${ticker}" not found` }, { status: 404 });
    }
  } catch (e) {
    console.error(`[api/research] quote gate failed for ${ticker}: ${String(e)}`);
    return NextResponse.json({ error: "Upstream data provider error" }, { status: 502 });
  }

  const id = await db.createResearchReport(ticker);
  // Fire and forget — see the serverless note in lib/research/generate.ts.
  runResearchReport(db, id, ticker).catch((e) =>
    console.error(`[api/research] unexpected orchestrator escape: ${String(e)}`)
  );

  return NextResponse.json({ id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase() || undefined;
  const limit = Math.min(Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50), 200);
  try {
    const reports = await db.listResearchReports(ticker, limit);
    return NextResponse.json({
      reports: reports.map((r) => ({ ...r, ...presentStatus(r) })),
    });
  } catch (e) {
    console.error(`[api/research] list failed: ${String(e)}`);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
