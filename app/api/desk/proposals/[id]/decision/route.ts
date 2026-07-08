import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { DecisionInputSchema } from "@/lib/desk";

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = parseId(id);
  if (!proposalId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: unknown;
  const isJson = req.headers.get("content-type")?.includes("application/json") ?? false;
  try {
    if (isJson) {
      body = await req.json();
    } else {
      const form = await req.formData();
      const decision = String(form.get("decision") ?? "");
      body = {
        decision,
        reason: String(form.get("reason") ?? "").trim() || `${decision} by PM`,
      };
    }
  } catch {
    return NextResponse.json({ error: isJson ? "Invalid JSON body" : "Invalid form body" }, { status: 400 });
  }
  const parsed = DecisionInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const detail = await db.recordDeskDecision(proposalId, parsed.data);
    if (!isJson) return NextResponse.redirect(new URL(`/proposals/${proposalId}`, req.url), 303);
    return NextResponse.json(detail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "proposal_not_found" ? 404 : 400 });
  }
}
