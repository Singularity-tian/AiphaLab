import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { getFmp } from "@/lib/fmp";
import { DailyOrchestrator } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

// Background task store (per process)
let runningTask: Promise<any> | null = null;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetDate: string | undefined = body.date;

    if (runningTask) {
      return NextResponse.json({ status: "already_running" }, { status: 409 });
    }

    const db = new SimDB();
    const fmp = getFmp();
    const orchestrator = new DailyOrchestrator(db, fmp);

    // Fire-and-forget background task
    runningTask = orchestrator.advanceDay(targetDate).finally(() => {
      runningTask = null;
    });

    return NextResponse.json({ status: "started", date: targetDate ?? "auto" }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
