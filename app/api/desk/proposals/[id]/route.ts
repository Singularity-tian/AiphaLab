import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { DeskProposalPatchSchema } from "@/lib/desk";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = parseId(id);
  if (!proposalId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const db = new SimDB();
    const detail = await db.getDeskProposal(proposalId);
    if (!detail) return NextResponse.json({ error: "proposal_not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = parseId(id);
  if (!proposalId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = DeskProposalPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const detail = await db.updateDeskProposal(proposalId, parsed.data);
    return NextResponse.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "proposal_not_found" ? 404 : 400 });
  }
}
