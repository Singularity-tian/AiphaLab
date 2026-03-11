import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const db = new SimDB();
    const trades = db.getTrades(id, limit);
    return NextResponse.json(trades);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
