import { NextRequest, NextResponse } from "next/server";
import { generate } from "@/lib/llm";
import { ARCHETYPE_CLUSTERS } from "@/lib/persona";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const archetype = body.archetype ?? ARCHETYPE_CLUSTERS[Math.floor(Math.random() * ARCHETYPE_CLUSTERS.length)];
    const hints = (body.traits as string[] | undefined) ?? [];

    const prompt = `Generate a realistic stock trader persona for an AI simulation.

Archetype: "${archetype}"
${hints.length > 0 ? `Additional traits: ${hints.join(", ")}` : ""}

Format the response as a complete identity.md file using this exact structure:

# {Name} — {one-line archetype/style}

## Background
{2-3 sentences: age, career history, what shaped their worldview}

## Personality
- {trait 1}
- {trait 2}
- {trait 3}
- {trait 4}

## Trading Philosophy
{1-2 paragraphs: core beliefs about markets}

## Quirks
- {behavioral quirk 1}
- {behavioral quirk 2}

## Parameters
- Risk tolerance: {low | medium | high | reckless}
- Decision temperature: {0.1–0.9}
- Conviction multiplier: {0.5–2.0}

Return only the markdown content, no code fences.`;

    const identity = await generate(prompt, "", 0.8);
    return NextResponse.json({ identity });
  } catch (e) {
    console.error("Generate identity error:", e);
    return NextResponse.json({ error: "Failed to generate identity" }, { status: 500 });
  }
}
