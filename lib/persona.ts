import { z } from "zod";
import { generateStructuredWithRetry } from "./llm";

export const TraderPersonaSchema = z.object({
  name: z.string(),
  age: z.number().int().min(22).max(72),
  background: z.string(),
  personalityTraits: z.array(z.string()).min(2).max(5),
  riskTolerance: z.enum(["low", "medium", "high", "reckless"]),
  tradingStyle: z.string(),
  quirks: z.array(z.string()).min(1).max(4),
  decisionTemperature: z.number().min(0.1).max(0.95),
  convictionMultiplier: z.number().min(0.3).max(2.5),
  description: z.string(),
  watchlist: z.array(z.string()).length(30),
});

export type TraderPersona = z.infer<typeof TraderPersonaSchema>;

export const ARCHETYPE_CLUSTERS = [
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

// Fixed universe of liquid S&P 500 tickers
export const SP500_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B", "JPM", "V",
  "UNH", "XOM", "LLY", "JNJ", "MA", "PG", "AVGO", "HD", "CVX", "MRK",
  "ABBV", "COST", "PEP", "KO", "WMT", "BAC", "ADBE", "CRM", "TMO", "ACN",
  "MCD", "CSCO", "ABT", "WFC", "LIN", "DHR", "TXN", "NEE", "PM", "QCOM",
  "AMGN", "BMY", "UPS", "RTX", "HON", "LOW", "SPGI", "SBUX", "GE", "CAT",
  "ELV", "BLK", "MDT", "DE", "AXP", "GILD", "ADI", "VRTX", "SYK", "ISRG",
  "NOW", "MU", "LRCX", "KLAC", "PANW", "ANET", "SNPS", "CDNS", "FTNT", "CRWD",
  "AMD", "INTC", "ORCL", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "HAL",
  "BA", "LMT", "GD", "NOC", "TDG", "HWM", "DIS", "NFLX", "CMCSA", "T",
  "VZ", "TMUS", "WBD", "FOX", "PARA", "CHTR", "NET", "SNOW", "DDOG", "ZS",
];

/** Generate a deterministic 30-ticker watchlist seeded by agent index. */
export function generateWatchlist(agentIndex: number): string[] {
  const shuffled = [...SP500_UNIVERSE];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (agentIndex * 1103515245 + 12345 + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 30);
}

/** Format a persona as identity.md markdown. */
export function formatIdentityMd(persona: TraderPersona): string {
  return `# ${persona.name} — ${persona.tradingStyle}

## Background
${persona.background}

## Personality
${persona.personalityTraits.map((t) => `- ${t}`).join("\n")}

## Trading Philosophy
${persona.description}

## Quirks
${persona.quirks.map((q) => `- ${q}`).join("\n")}

## Parameters
- Risk tolerance: ${persona.riskTolerance}
- Decision temperature: ${persona.decisionTemperature}
- Conviction multiplier: ${persona.convictionMultiplier}
`;
}

/** Format a persona as strategy.md markdown. */
export function formatStrategyMd(persona: TraderPersona): string {
  const watchlistStr = persona.watchlist.join(", ");

  const entryRules = _generateEntryRules();
  const exitRules = _generateExitRules(persona);
  const sizing = _generateSizingRules(persona);

  return `# ${persona.name} — Trading Strategy

## Watchlist
${watchlistStr}

## Entry Rules
${entryRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Exit Rules
${exitRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Position Sizing
${sizing}

## Risk Management
- Max portfolio drawdown before going to cash: ${persona.riskTolerance === "reckless" ? "30%" : persona.riskTolerance === "high" ? "20%" : persona.riskTolerance === "medium" ? "15%" : "10%"}
- Max concurrent positions: ${persona.riskTolerance === "reckless" ? 15 : persona.riskTolerance === "high" ? 10 : 7}
- Max single-position concentration: ${Math.round(persona.convictionMultiplier * 15)}%

## Self-Identified Weaknesses
- (To be updated by evolution engine after first week of trading)

## Strategy Changelog
- Initialized: ${new Date().toISOString().split("T")[0]}
`;
}

function _generateEntryRules(): string[] {
  return [
    "Combined signal score > 0.62 (blended value + momentum)",
    "Graham score > 0.55 AND momentum score > 0.50",
    "No more than 2 correlated positions from same sector",
  ];
}

function _generateExitRules(persona: TraderPersona): string[] {
  const stopPct = persona.riskTolerance === "reckless" ? 25 : persona.riskTolerance === "high" ? 20 : persona.riskTolerance === "medium" ? 15 : 10;
  return [
    `Trailing stop-loss: sell if price drops ${stopPct}% from trailing high`,
    "Signal score drops below 0.35 (thesis invalidation)",
    "Position reaches profit target of 30% gain (take partial profits)",
  ];
}

function _generateSizingRules(persona: TraderPersona): string[] {
  const base = Math.round(100 / (persona.riskTolerance === "reckless" ? 6 : 8));
  return [
    `Base allocation: ${base}% of portfolio per position`,
    `Scale-up condition: conviction > 0.8 → allocate up to ${Math.round(base * persona.convictionMultiplier)}%`,
    `Max concurrent positions: ${persona.riskTolerance === "reckless" ? 15 : persona.riskTolerance === "high" ? 10 : 7}`,
    `Max single-position concentration: ${Math.round(persona.convictionMultiplier * 15)}%`,
  ];
}

export async function generatePersonaBatch(
  archetypeCluster: string,
  agentIndexStart: number,
  batchSize = 10
): Promise<TraderPersona[]> {
  const prompt = `Generate ${batchSize} realistic trader personas for a stock market simulation.

Archetype cluster: "${archetypeCluster}"

Rules:
- Distinct names, believable backgrounds
- Personality traits include realistic cognitive biases
- Quirks are specific behavioral patterns affecting trading
- decisionTemperature: 0.1=robotic, 0.95=impulsive
- convictionMultiplier: 0.5=timid, 2.5=overconfident
- watchlist: exactly 30 S&P 500 tickers

Return JSON array of ${batchSize} traders:
{
  "name": string, "age": number, "background": string,
  "personalityTraits": string[], "riskTolerance": "low"|"medium"|"high"|"reckless",
  "tradingStyle": string,
  "quirks": string[], "decisionTemperature": number, "convictionMultiplier": number,
  "description": string, "watchlist": string[]
}`;

  const BatchSchema = z.array(TraderPersonaSchema).length(batchSize);
  try {
    return await generateStructuredWithRetry(prompt, BatchSchema, 0.8);
  } catch {
    const RelaxedSchema = z.array(z.any()).min(1);
    const raw = await generateStructuredWithRetry(prompt, RelaxedSchema, 0.8);
    return (raw as any[]).map((p, i) => ({
      name: p.name ?? `Trader ${agentIndexStart + i}`,
      age: p.age ?? 35,
      background: p.background ?? "Independent trader.",
      personalityTraits: p.personalityTraits ?? ["analytical"],
      riskTolerance: p.riskTolerance ?? "medium",
      tradingStyle: p.tradingStyle ?? "swing",
      quirks: p.quirks ?? ["follows signals strictly"],
      decisionTemperature: p.decisionTemperature ?? 0.5,
      convictionMultiplier: p.convictionMultiplier ?? 1.0,
      description: p.description ?? "A disciplined trader.",
      watchlist: p.watchlist ?? generateWatchlist(agentIndexStart + i),
    }));
  }
}

export async function generateAllPersonas(n: number): Promise<TraderPersona[]> {
  const personas: TraderPersona[] = [];
  const batchSize = 10;
  const batches = Math.ceil(n / batchSize);

  for (let i = 0; i < batches; i++) {
    const cluster = ARCHETYPE_CLUSTERS[i % ARCHETYPE_CLUSTERS.length];
    const size = Math.min(batchSize, n - personas.length);
    console.log(`  Batch ${i + 1}/${batches} (${cluster})...`);
    try {
      const batch = await generatePersonaBatch(cluster, personas.length, size);
      const processed = batch.map((p, j) => ({
        ...p,
        watchlist: generateWatchlist(personas.length + j),
      }));
      personas.push(...processed);
    } catch (e) {
      console.error(`  Batch ${i + 1} failed:`, e);
      for (let j = 0; j < size; j++) {
        const idx = personas.length;
        personas.push({
          name: `Trader ${idx + 1}`,
          age: 30 + (idx % 40),
          background: "Independent retail trader.",
          personalityTraits: ["disciplined", "analytical"],
          riskTolerance: "medium",
          tradingStyle: "signal-follower",
          quirks: ["follows signals strictly"],
          decisionTemperature: 0.3,
          convictionMultiplier: 1.0,
          description: "A methodical trader who follows quantitative signals.",
          watchlist: generateWatchlist(idx),
        });
      }
    }
    if (i < batches - 1) await new Promise((r) => setTimeout(r, 2000));
  }

  return personas.slice(0, n);
}
