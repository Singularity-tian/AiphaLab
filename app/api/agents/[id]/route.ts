import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { FileStore } from "@/lib/fileStore";

export const dynamic = "force-dynamic";

const db = new SimDB();
const fileStore = new FileStore();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    const agent = await db.getAgent(id);
    if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const [state, snap, positions] = await Promise.all([
      db.getAgentState(id),
      db.getLatestSnapshot(id),
      db.getPositions(id),
    ]);

    // Try to load latest journal entry for mood
    let latestReview: { date: string; mood: string; content: string } | null = null;
    try {
      const dates = await fileStore.listJournalDates(id);
      if (dates.length > 0) {
        const lastDate = dates[dates.length - 1];
        const content = await fileStore.readJournal(id, lastDate);
        const moodMatch = content?.match(/## Mood:\s*(\w+)/i);
        latestReview = { date: lastDate, mood: moodMatch?.[1] ?? "neutral", content: content ?? "" };
      }
    } catch {}

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      strategy: agent.strategy_name,
      initialCash: agent.initial_cash,
      state: state ?? { cash: agent.initial_cash, portfolio_value: agent.initial_cash, total_pnl: 0, run_count: 0 },
      latestSnapshot: snap,
      latestReview,
      positions: positions.map((p) => ({
        ticker: p.ticker,
        shares: p.shares,
        entryPrice: p.entry_price,
        entryDate: p.entry_date,
        trailingHigh: p.trailing_high,
        costBasis: p.cost_basis,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
