import { NextRequest, NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";
import { CioAskInputSchema, personalContextForPrompt } from "@/lib/personal";
import { generate } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = CioAskInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const db = new SimDB();
    const dashboard = await db.getPersonalDashboard();
    const context = personalContextForPrompt(dashboard);
    const answer = await generate(
      buildCioPrompt(parsed.data.question, context),
      "You are the user's personal CIO, CFO, and risk officer. Be specific, conservative with unknowns, and action-oriented. Never claim to place trades. Do not provide generic education when the user's personal data answers the question.",
      0.2,
      undefined,
      1400
    );
    await db.saveCioDecision(parsed.data.question, answer, {
      context: JSON.parse(context),
      contextScore: dashboard.metrics.contextScore,
    });
    return NextResponse.json({ answer, contextScore: dashboard.metrics.contextScore, missingContext: dashboard.missingContext });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

function buildCioPrompt(question: string, context: string) {
  return `
You are answering inside a personal investment and wealth-management cockpit.

User question:
${question}

Personal context JSON:
${context}

Answer format:
1. Direct answer in 2-4 sentences.
2. Portfolio/cash-flow reasoning using the context numbers.
3. Risk checks and missing information.
4. Concrete next actions.

Rules:
- If context is missing, say exactly what is missing and how that limits confidence.
- Tie every recommendation to cash reserve, monthly surplus, net worth, concentration, and max single-idea risk when available.
- For trade questions, give a decision stance: approve to research, defer, reduce, avoid, or only starter-size.
- Manual execution only; never say you placed or will place an order.
- Use concise Markdown.
`;
}
