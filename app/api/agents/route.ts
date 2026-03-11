import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const db = new SimDB();

export async function GET() {
  try {
    const agents = await db.getAllAgents();
    const result = await Promise.all(
      agents.map(async (a) => {
        const [state, snap] = await Promise.all([
          db.getAgentState(a.id),
          db.getLatestSnapshot(a.id),
        ]);
        return {
          id: a.id,
          name: a.name,
          strategy: a.strategy_name,
          cash: state?.cash ?? a.initial_cash,
          portfolioValue: snap?.portfolio_value ?? a.initial_cash,
          cumulativeReturn: snap?.cumulative_return ?? 0,
          dailyReturn: snap?.daily_return ?? 0,
          lastRunDate: state?.last_run_date ?? null,
          runCount: state?.run_count ?? 0,
        };
      })
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
