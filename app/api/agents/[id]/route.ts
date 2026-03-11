import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    const db = new SimDB();
    const agent = db.getAgent(id);
    if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const persona = JSON.parse(agent.persona_json);
    const state = db.getAgentState(id);
    const review = db.getLatestReview(id);
    const snap = db.getLatestSnapshot(id);
    const positions = db.getPositions(id);

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      strategy: agent.strategy_name,
      initialCash: agent.initial_cash,
      persona,
      state: state ?? { cash: agent.initial_cash, portfolio_value: agent.initial_cash, total_pnl: 0, run_count: 0 },
      latestSnapshot: snap,
      latestReview: review,
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
