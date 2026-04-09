import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Database connectivity
  try {
    const db = new SimDB();
    const agents = await db.getAllAgents();
    checks.database = { ok: true, detail: `${agents.length} agents` };
  } catch (e) {
    checks.database = { ok: false, detail: (e as Error).message };
  }

  // Environment variables
  checks.env = {
    ok: !!(process.env.DATABASE_URL && process.env.AZURE_API_KEY),
    detail: [
      process.env.DATABASE_URL ? "DB" : "!DB",
      process.env.AZURE_API_KEY ? "LLM" : "!LLM",
      process.env.FMP_API_KEY ? "FMP" : "!FMP",
      process.env.OPENAI_API_KEY ? "EMB" : "!EMB",
      process.env.FILESTORE_BACKEND === "pg" ? "PG_FS" : "LOCAL_FS",
    ].join(" "),
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ status: allOk ? "healthy" : "degraded", checks }, { status: allOk ? 200 : 503 });
}
