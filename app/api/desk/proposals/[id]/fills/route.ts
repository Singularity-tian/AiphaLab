import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { FillInputSchema } from "@/lib/desk";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = parseId(id);
  if (!proposalId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = FillInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const detail = await db.recordManualFill(proposalId, parsed.data);
    return NextResponse.json(detail, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "proposal_not_found" ? 404 : 400 });
  }
}
