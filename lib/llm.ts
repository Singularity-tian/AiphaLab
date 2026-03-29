import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import { z } from "zod";

let _client: AnthropicFoundry | null = null;

function getClient(): AnthropicFoundry {
  if (!_client) {
    _client = new AnthropicFoundry({
      apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY,
      baseURL: process.env.ANTHROPIC_FOUNDRY_BASE_URL!,
    });
  }
  return _client;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Generate a free-form text response. */
export async function generate(
  prompt: string,
  systemPrompt = "",
  temperature = 0.7,
  model = DEFAULT_MODEL
): Promise<string> {
  const msg = await getClient().messages.create({
    model,
    max_tokens: 1024,
    temperature,
    system: systemPrompt || undefined,
    messages: [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`Unexpected LLM response: ${block?.type ?? "empty content"}`);
  }
  return block.text;
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

  const msg = await getClient().messages.create({
    model,
    max_tokens: 2048,
    temperature,
    system: (systemPrompt || "You are a precise JSON-generating assistant.") + jsonInstruction,
    messages: [{ role: "user", content: prompt }],
  });

  const block = msg.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`Unexpected LLM response for structured generation: ${block?.type ?? "empty content"}`);
  }
  const raw = block.text;

  const parsed = extractJson(raw);
  return schema.parse(parsed);
}

/** Retry wrapper — retries up to 3 times, feeding back errors so the LLM can self-correct. */
export async function generateStructuredWithRetry<T>(
  prompt: string,
  schema: z.ZodType<T>,
  temperature = 0.1,
  model = DEFAULT_MODEL,
  systemPrompt = ""
): Promise<T> {
  let lastError: unknown;
  let currentPrompt = prompt;
  for (let i = 0; i < 3; i++) {
    try {
      return await generateStructured(currentPrompt, schema, temperature, model, systemPrompt);
    } catch (e) {
      lastError = e;
      const errMsg = (e as Error).message;
      currentPrompt = prompt + `\n\n[SYSTEM: Your previous response was invalid: ${errMsg}. Please fix and respond with ONLY valid JSON.]`;
      if (i < 2) await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
}

/**
 * Extract JSON from LLM output that may contain markdown fences or trailing text.
 * Tries direct parse first (fast path), then falls back to bracket-aware extraction.
 */
function extractJson(raw: string): unknown {
  // Strip markdown code fences
  const text = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  // Fast path: direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to bracket matching
  }

  // Find the first [ or { and extract the matching balanced structure
  const startIdx = text.search(/[\[{]/);
  if (startIdx === -1) throw new SyntaxError("No JSON structure found in LLM output");

  const openChar = text[startIdx];
  const closeChar = openChar === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) {
      return JSON.parse(text.slice(startIdx, i + 1));
    }
  }

  throw new SyntaxError("Unbalanced JSON structure in LLM output");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
