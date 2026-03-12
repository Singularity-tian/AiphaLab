import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SimDB } from "@/lib/db/repository";
import { PgFileStore, type TickerBelief } from "@/lib/fileStore";

const db = new SimDB();
const fileStore = new PgFileStore();

const CreateAgentSchema = z.object({
  identity: z.string().min(50),
  strategy: z.string().min(50),
  beliefs: z.record(z.string(), z.any()).optional().default({}),
  name: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateAgentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { identity, strategy, beliefs, name } = parsed.data;

    // Insert DB row
    const agentId = await db.insertAgent({
      name,
      initial_cash: 100_000,
      is_active: true,
    });

    try {
      // Initialize agent state
      await db.upsertAgentState({
        agent_id: agentId,
        cash: 100_000,
        portfolio_value: 100_000,
        total_pnl: 0,
        last_run_date: null,
        run_count: 0,
      });

      // Write soul files to Postgres agent_docs table
      await fileStore.initializeAgentDir(agentId, identity, strategy, beliefs as Record<string, TickerBelief>);
    } catch (e) {
      // Rollback: delete orphan agent row if soul file write fails
      await db.deleteAgent(agentId);
      throw e;
    }

    return NextResponse.json({ agentId });
  } catch (e) {
    console.error("Create agent error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
