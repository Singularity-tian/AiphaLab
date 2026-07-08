import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { PersonalProfileInputSchema } from "@/lib/personal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = new SimDB();
    const profile = await db.getPersonalProfile();
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PersonalProfileInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const profile = await db.upsertPersonalProfile(parsed.data);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
