import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = new SimDB();
    const theses = await db.listActiveTheses(100);
    return NextResponse.json({ theses });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
