import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { presentStatus } from "@/lib/research/lenses";

export const dynamic = "force-dynamic";

const db = new SimDB();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const row = await db.getResearchReport(numId);
    if (!row) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const presented = presentStatus(row);
    return NextResponse.json({ ...row, status: presented.status, error: presented.error ?? row.error });
  } catch (e) {
    console.error(`[api/research/${id}] failed: ${String(e)}`);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
