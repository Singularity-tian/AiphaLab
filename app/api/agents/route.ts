import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = new SimDB();
    const agents = db.getAllAgents();
    const result = agents.map((a) => {
      const persona = JSON.parse(a.persona_json);
      const state = db.getAgentState(a.id);
      const review = db.getLatestReview(a.id);
      const snap = db.getLatestSnapshot(a.id);
      return {
        id: a.id,
        name: a.name,
        strategy: a.strategy_name,
        riskTolerance: persona.riskTolerance,
        personalityTraits: persona.personalityTraits,
        cash: state?.cash ?? a.initial_cash,
        portfolioValue: snap?.portfolio_value ?? a.initial_cash,
        cumulativeReturn: snap?.cumulative_return ?? 0,
        dailyReturn: snap?.daily_return ?? 0,
        mood: review?.mood ?? "neutral",
        lastRunDate: state?.last_run_date ?? null,
        runCount: state?.run_count ?? 0,
      };
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
