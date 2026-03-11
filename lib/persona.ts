import { z } from "zod";
import { generateStructuredWithRetry } from "./llm";

export const TraderPersonaSchema = z.object({
  name: z.string(),
  age: z.number().int().min(22).max(72),
  background: z.string(),
  personalityTraits: z.array(z.string()).min(2).max(5),
  riskTolerance: z.enum(["low", "medium", "high", "reckless"]),
  preferredStrategy: z.string(),
  tradingStyle: z.string(),
  quirks: z.array(z.string()).min(1).max(4),
  decisionTemperature: z.number().min(0.1).max(0.95),
  convictionMultiplier: z.number().min(0.3).max(2.5),
  description: z.string(),
  watchlist: z.array(z.string()).length(30),
});

export type TraderPersona = z.infer<typeof TraderPersonaSchema>;

const ARCHETYPE_CLUSTERS = [
  "Former Goldman Sachs or hedge fund analyst who went independent",
  "Self-taught retail trader from Middle America with strong opinions",
  "Recently retired engineer who discovered investing late in life",
  "Young aggressive trader fresh out of college, influenced by fintwit",
  "Cautious professor of finance who trades conservatively",
  "Day trader from Asia with disciplined technical approach",
  "Behavioral economist who overthinks every decision",
  "Momentum chaser who FOMO's into every trending stock",
  "Deep value contrarian who hates everything popular",
  "Former journalist turned market commentator and occasional trader",
];

// A fixed universe of liquid S&P 500 tickers to draw watchlists from
export const SP500_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B", "JPM", "V",
  "UNH", "XOM", "LLY", "JNJ", "MA", "PG", "AVGO", "HD", "CVX", "MRK",
  "ABBV", "COST", "PEP", "KO", "WMT", "BAC", "ADBE", "CRM", "TMO", "ACN",
  "MCD", "CSCO", "ABT", "WFC", "LIN", "DHR", "TXN", "NEE", "PM", "QCOM",
  "AMGN", "BMY", "UPS", "RTX", "HON", "LOW", "SPGI", "SBUX", "GE", "CAT",
  "ELV", "BLK", "MDT", "DE", "AXP", "GILD", "ADI", "VRTX", "SYK", "ISRG",
  "NOW", "MU", "LRCX", "KLAC", "PANW", "ANET", "SNPS", "CDNS", "FTNT", "CRWD",
  "AMD", "INTC", "ORCL", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "HAL",
  "BA", "LMT", "GD", "NOC", "L3T", "TDG", "HII", "HWM", "SPR", "WWD",
  "DIS", "NFLX", "CMCSA", "T", "VZ", "TMUS", "WBD", "FOX", "PARA", "CHTR",
];

/** Generate a deterministic watchlist for an agent seeded by their index. */
export function generateWatchlist(agentIndex: number): string[] {
  // Shuffle SP500_UNIVERSE deterministically based on agentIndex
  const shuffled = [...SP500_UNIVERSE];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (agentIndex * 1103515245 + 12345 + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 30);
}

export async function generatePersonaBatch(
  archetypeCluster: string,
  strategies: string[],
  agentIndexStart: number,
  batchSize = 10
): Promise<TraderPersona[]> {
  const strategyList = strategies.join(", ");
  const prompt = `Generate ${batchSize} realistic trader personas for a stock market simulation.

Archetype cluster for this batch: "${archetypeCluster}"

Rules:
- Each trader should have a distinct name, age, and believable background
- Personality traits should include realistic cognitive biases (FOMO, overconfidence, loss aversion, anchoring, etc.)
- Quirks should be specific behavioral patterns that affect trading (e.g., "always sells everything before earnings", "never buys tech stocks", "doubles down when losing")
- decisionTemperature: 0.1 = robotic signal follower, 0.95 = highly impulsive
- convictionMultiplier: 0.5 = timid half-sizer, 2.5 = overconfident oversizer
- preferredStrategy must be one of: ${strategyList}
- watchlist: provide exactly 30 ticker symbols from the S&P 500

Return a JSON array of ${batchSize} trader objects.

Schema for each trader:
{
  "name": string,
  "age": number (22-72),
  "background": string (2-3 sentences),
  "personalityTraits": string[] (2-5 items),
  "riskTolerance": "low" | "medium" | "high" | "reckless",
  "preferredStrategy": string,
  "tradingStyle": string,
  "quirks": string[] (1-4 specific behavioral quirks),
  "decisionTemperature": number (0.1-0.95),
  "convictionMultiplier": number (0.3-2.5),
  "description": string (2-3 sentence narrative),
  "watchlist": string[] (exactly 30 S&P 500 tickers)
}`;

  const BatchSchema = z.array(TraderPersonaSchema).length(batchSize);
  try {
    return await generateStructuredWithRetry(prompt, BatchSchema, 0.8);
  } catch {
    // Fallback: generate with relaxed schema
    const RelaxedSchema = z.array(z.any()).min(1);
    const raw = await generateStructuredWithRetry(prompt, RelaxedSchema, 0.8);
    return (raw as any[]).map((p, i) => ({
      name: p.name ?? `Trader ${agentIndexStart + i}`,
      age: p.age ?? 35,
      background: p.background ?? "Independent trader.",
      personalityTraits: p.personalityTraits ?? ["analytical"],
      riskTolerance: p.riskTolerance ?? "medium",
      preferredStrategy: p.preferredStrategy ?? strategies[0],
      tradingStyle: p.tradingStyle ?? "swing",
      quirks: p.quirks ?? ["follows signals strictly"],
      decisionTemperature: p.decisionTemperature ?? 0.5,
      convictionMultiplier: p.convictionMultiplier ?? 1.0,
      description: p.description ?? "A disciplined trader.",
      watchlist: p.watchlist ?? generateWatchlist(agentIndexStart + i),
    }));
  }
}

export async function generateAllPersonas(
  n: number,
  strategies: string[]
): Promise<TraderPersona[]> {
  const personas: TraderPersona[] = [];
  const batchSize = 10;
  const batches = Math.ceil(n / batchSize);

  for (let i = 0; i < batches; i++) {
    const cluster = ARCHETYPE_CLUSTERS[i % ARCHETYPE_CLUSTERS.length];
    const size = Math.min(batchSize, n - personas.length);
    console.log(`  Generating persona batch ${i + 1}/${batches} (${cluster})...`);
    try {
      const batch = await generatePersonaBatch(cluster, strategies, personas.length, size);
      // Override watchlist with deterministic version to ensure exactly 30
      const processed = batch.map((p, j) => ({
        ...p,
        watchlist: generateWatchlist(personas.length + j),
      }));
      personas.push(...processed);
    } catch (e) {
      console.error(`  Batch ${i + 1} failed:`, e);
      // Fill with fallbacks
      for (let j = 0; j < size; j++) {
        const idx = personas.length;
        personas.push({
          name: `Trader ${idx + 1}`,
          age: 30 + (idx % 40),
          background: "Independent retail trader with several years of experience.",
          personalityTraits: ["disciplined", "analytical"],
          riskTolerance: "medium",
          preferredStrategy: strategies[idx % strategies.length],
          tradingStyle: "signal-follower",
          quirks: ["strictly follows technical signals"],
          decisionTemperature: 0.3,
          convictionMultiplier: 1.0,
          description: "A methodical trader who follows quantitative signals.",
          watchlist: generateWatchlist(idx),
        });
      }
    }
    // Rate limit between batches
    if (i < batches - 1) await sleep(2000);
  }

  return personas.slice(0, n);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
