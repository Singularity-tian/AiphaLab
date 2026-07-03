import OpenAI from "openai";
import { z } from "zod";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.AZURE_API_KEY,
      baseURL: process.env.AZURE_BASE_URL!,
    });
  }
  return _client;
}

const DEFAULT_MODEL = "gpt-5.4";

/** Generate a free-form text response. */
export async function generate(
  prompt: string,
  systemPrompt = "",
  _temperature = 0.7,
  model = DEFAULT_MODEL,
  maxTokens = 1024
): Promise<string> {
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await getClient().chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    messages,
  });
  const text = resp.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Unexpected LLM response: empty content");
  }
  return text;
}

/**
 * Generate a structured JSON response validated against a Zod schema.
 * Instructs the model to respond with only valid JSON.
 */
export async function generateStructured<T>(
  prompt: string,
  schema: z.ZodType<T>,
  _temperature = 0.1,
  model = DEFAULT_MODEL,
  systemPrompt = ""
): Promise<T> {
  const jsonInstruction =
    "\n\nRespond with ONLY valid JSON that matches the requested schema. No markdown, no explanation.";

  const resp = await getClient().chat.completions.create({
    model,
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content: (systemPrompt || "You are a precise JSON-generating assistant.") + jsonInstruction,
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Unexpected LLM response for structured generation: empty content");
  }

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
