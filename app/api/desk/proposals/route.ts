import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SimDB } from "@/lib/db/repository";
import { DeskProposalInputSchema, ProposalStatusSchema, normalizeProposalInput } from "@/lib/desk";

export const dynamic = "force-dynamic";

const ListSchema = z.object({
  status: ProposalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const parsed = ListSchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const proposals = await db.listDeskProposals(parsed.data.limit, parsed.data.status);
    return NextResponse.json({ proposals });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DeskProposalInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const input = normalizeProposalInput(parsed.data);
    const db = new SimDB();
    const detail = await db.createDeskProposal(input);
    return NextResponse.json(detail, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
