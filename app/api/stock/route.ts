import { NextRequest, NextResponse } from "next/server";
import { getStockBundle } from "@/lib/stockData";

export const dynamic = "force-dynamic";

// FMP symbols: letters, digits, dot, hyphen (e.g. BRK.B, RDS-A). Length-capped.
const TICKER_RE = /^[A-Z0-9.\-]{1,10}$/;

// Best-effort per-IP fixed-window limiter. On serverless this is per-instance,
// not global — a pragmatic guard against a single client hammering the paid FMP
// API. For a hard global limit, back this with a shared store (KV/Redis).
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const _hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = _hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    _hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (_hits.size > 5000) {
      for (const [k, v] of _hits) if (now >= v.resetAt) _hits.delete(k);
    }
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker param" }, { status: 400 });
  }
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const bundle = await getStockBundle(ticker);
    if (!bundle) {
      return NextResponse.json({ error: `Ticker "${ticker}" not found` }, { status: 404 });
    }
    return NextResponse.json(bundle);
  } catch (e) {
    console.error(`[api/stock] upstream error for ${ticker}: ${String(e)}`);
    return NextResponse.json({ error: "Upstream data provider error" }, { status: 502 });
  }
}

