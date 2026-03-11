import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

const db = new SimDB();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    const snapshots = await db.getSnapshots(id);
    return NextResponse.json(snapshots);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
