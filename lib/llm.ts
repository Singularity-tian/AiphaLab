import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true, // safe: only called from Next.js server components + daemon
});

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Generate a free-form text response. */
export async function generate(
  prompt: string,
  systemPrompt = "",
  temperature = 0.7,
  model = DEFAULT_MODEL
): Promise<string> {
  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature,
    system: systemPrompt || undefined,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

/**
 * Generate a structured JSON response validated against a Zod schema.
 * Instructs the model to respond with only valid JSON.
 */
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  temperature = 0.1,
  model = DEFAULT_MODEL,
  systemPrompt = ""
): Promise<T> {
  const jsonInstruction =
    "\n\nRespond with ONLY valid JSON that matches the requested schema. No markdown, no explanation.";

  const msg = await client.messages.create({
    model,
    max_tokens: 2048,
    temperature,
    system: (systemPrompt || "You are a precise JSON-generating assistant.") + jsonInstruction,
    messages: [{ role: "user", content: prompt }],
  });

  const block = msg.content[0];
  const raw = block.type === "text" ? block.text : "{}";

  // Strip markdown code fences if model wrapped the JSON
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  const parsed = JSON.parse(cleaned);
  return schema.parse(parsed);
}

/** Retry wrapper — retries up to 3 times on failure. */
export async function generateStructuredWithRetry<T>(
  prompt: string,
  schema: z.ZodType<T>,
  temperature = 0.1,
  model = DEFAULT_MODEL,
  systemPrompt = ""
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await generateStructured(prompt, schema, temperature, model, systemPrompt);
    } catch (e) {
      lastError = e;
      if (i < 2) await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
