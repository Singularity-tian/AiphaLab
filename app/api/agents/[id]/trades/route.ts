import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const db = new SimDB();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const trades = await db.getTrades(id, limit);

    // Trades are returned DESC (latest first). Create ASC copy for BUY lookup
    // so we find the most recent BUY *before* each SELL (not the earliest).
    const tradesAsc = [...trades].reverse();

    // For SELL trades, find the matching BUY entry price to compute P/L
    const enriched = trades.map((t) => {
      if (t.side === "SELL") {
        // Search ASC array in reverse to find the most recent BUY before this SELL
        const matchingBuy = tradesAsc.findLast(
          (b) => b.side === "BUY" && b.ticker === t.ticker && b.date <= t.date
        );
        const entryPrice = matchingBuy?.price ?? null;
        const tradePnl = entryPrice ? (t.price - entryPrice) / entryPrice : null;
        return { ...t, entryPrice, tradePnl };
      }
      return { ...t, entryPrice: null, tradePnl: null };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
