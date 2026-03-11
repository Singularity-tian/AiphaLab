import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = new SimDB();
    const rows = db.getLeaderboard(100);
    const leaderboard = rows.map((r: any, i: number) => ({
      rank: i + 1,
      id: r.id,
      name: r.name,
      strategy: r.strategy_name,
      portfolioValue: r.portfolio_value,
      cumulativeReturn: r.cumulative_return ?? 0,
      dailyReturn: r.daily_return ?? 0,
      tradeCount: r.trade_count ?? 0,
      snapDate: r.snap_date,
    }));
    return NextResponse.json(leaderboard);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
