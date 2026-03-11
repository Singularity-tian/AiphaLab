import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generate } from "@/lib/llm";
import { SP500_UNIVERSE } from "@/lib/persona";

const Schema = z.object({ identity: z.string().min(50) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "identity string required (min 50 chars)" }, { status: 400 });
    }

    const { identity } = parsed.data;
    const sampleTickers = SP500_UNIVERSE.slice(0, 50).join(", ");

    const prompt = `Based on this trader's identity, generate a complete strategy.md for them.

Identity:
${identity}

Format as a complete strategy.md using this exact structure:

# {Name} — Trading Strategy

## Watchlist
{exactly 30 S&P 500 tickers, comma-separated. Choose from: ${sampleTickers}, and others}

## Entry Rules
1. {Condition with specific thresholds}
2. {Condition}
3. {Condition}

## Exit Rules
1. {Trailing stop rule with percentage}
2. {Thesis invalidation condition}
3. {Profit target rule}

## Position Sizing
- Base allocation: {X}% of portfolio
- Scale-up condition: {when and how much}
- Max concurrent positions: {N}
- Max single-position concentration: {Y}%

## Risk Management
- Max portfolio drawdown before going to cash: {Z}%
- Sector concentration limit: {W}%
- Correlation check: {rule}

## Self-Identified Weaknesses
- (Will be updated after first week of trading)

## Strategy Changelog
- Initialized: ${new Date().toISOString().split("T")[0]}

Make the strategy match the trader's personality, risk tolerance, and philosophy from their identity.
Return only the markdown content, no code fences.`;

    const strategy = await generate(prompt, "", 0.7);
    return NextResponse.json({ strategy });
  } catch (e) {
    console.error("Generate strategy error:", e);
    return NextResponse.json({ error: "Failed to generate strategy" }, { status: 500 });
  }
}
