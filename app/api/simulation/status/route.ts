import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const db = new SimDB();

function nextBusinessDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const [last, agents] = await Promise.all([
      db.getLastSimLog(),
      db.getAllAgents(),
    ]);
    const nextDate = last?.date ? nextBusinessDay(last.date) : null;

    return NextResponse.json({
      lastRunDate: last?.date ?? null,
      lastRunAgents: last?.agents_processed ?? 0,
      nextEligibleDate: nextDate,
      agentCount: agents.length,
      isRunning: last?.finished_at === null && last?.started_at !== null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
