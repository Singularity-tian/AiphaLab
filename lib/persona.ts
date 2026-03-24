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

// ---- Strategy templates for diverse trading approaches ----

export type StrategyTemplateName = "value" | "momentum" | "growth" | "income" | "contrarian" | "garp";

interface StrategyTemplate {
  entryRules: (p: TraderPersona) => string[];
  exitRules: (p: TraderPersona) => string[];
  sizingRules: (p: TraderPersona) => string[];
  riskManagement: (p: TraderPersona) => string;
}

const STRATEGY_TEMPLATES: Record<StrategyTemplateName, StrategyTemplate> = {
  value: {
    entryRules: () => [
      "PE score > 0.65 (stock is cheap relative to its own history)",
      "PB score > 0.60 AND current ratio score > 0.55 (financial health confirmed)",
      "Dividend yield score > 0.50 (income floor provides margin of safety)",
      "No entry if RSI > 0.75 (avoid catching a value trap in overbought territory)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 25 : p.riskTolerance === "high" ? 22 : p.riskTolerance === "medium" ? 18 : 15;
      return [
        `Trailing stop-loss: sell if price drops ${stopPct}% from trailing high`,
        "PE score drops below 0.35 (stock becoming expensive vs its own history — thesis invalidation)",
        "Profit target: 40-50% gain — close 70% at target, trail remainder",
        "Exit if current ratio score falls below 0.30 (deteriorating financial health)",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 16 : p.riskTolerance === "high" ? 14 : 10;
      return [
        `Base allocation: ${base}% of portfolio per position`,
        `High conviction (conviction > 0.85 AND pe > 0.75): allocate up to ${Math.round(base * 1.5)}%`,
        `Max concurrent positions: ${p.riskTolerance === "reckless" ? 12 : p.riskTolerance === "high" ? 9 : 6}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 25 : p.riskTolerance === "high" ? 20 : 15;
      return `- Max portfolio drawdown: ${dd}% from high-water mark → reduce all positions by 50%\n- Max sector concentration: 30% in single GICS sector\n- Prefer stocks with dividend yield score > 0.40 as a risk buffer`;
    },
  },

  momentum: {
    entryRules: () => [
      "Momentum score > 0.65 (strong 12-1 month price trend)",
      "RSI between 0.50 and 0.80 (trending but not yet overbought)",
      "Relative volume score > 0.55 (above-average volume confirms institutional participation)",
      "EPS trend score > 0.45 (earnings not collapsing — trend has fundamental support)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 15 : p.riskTolerance === "high" ? 12 : p.riskTolerance === "medium" ? 10 : 8;
      return [
        `Tight trailing stop: sell if price drops ${stopPct}% from trailing high`,
        "Momentum score drops below 0.40 (trend reversal signal)",
        "RSI rises above 0.85 — take profits (overbought, likely to pull back)",
        "Profit target: 15-25% gain — close 50% at first target, trail the rest",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 18 : p.riskTolerance === "high" ? 15 : 12;
      return [
        `Base allocation: ${base}% of portfolio per position`,
        `Scale-in: if momentum > 0.75 AND rvol > 0.60, add up to ${Math.round(base * 0.5)}% more`,
        `Max concurrent positions: ${p.riskTolerance === "reckless" ? 15 : p.riskTolerance === "high" ? 12 : 8}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 20 : p.riskTolerance === "high" ? 15 : 12;
      return `- Max portfolio drawdown: ${dd}% → close all positions, sit in cash for 3 days\n- Max sector concentration: 35% (momentum clusters in sectors)\n- Cut losers fast: any position down ${Math.round(dd * 0.6)}% from entry gets immediate review`;
    },
  },

  growth: {
    entryRules: () => [
      "EPS trend score > 0.65 (earnings accelerating vs prior 4 quarters)",
      "ROE score > 0.60 (management effectively deploying capital)",
      "Momentum score > 0.45 (price confirming growth trajectory)",
      "Combined signal > 0.55 (growth at a reasonable overall quality level)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 20 : p.riskTolerance === "high" ? 17 : p.riskTolerance === "medium" ? 15 : 12;
      return [
        `Trailing stop-loss: sell if price drops ${stopPct}% from trailing high`,
        "EPS trend score drops below 0.40 (earnings deceleration — growth thesis failing)",
        "ROE score falls below 0.35 (management quality deteriorating)",
        "Profit target: 25-35% gain — partial exit at target, let winners run",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 16 : p.riskTolerance === "high" ? 13 : 10;
      return [
        `Base allocation: ${base}% of portfolio per position`,
        `High-growth conviction: if eps_trend > 0.75 AND roe > 0.65, allocate up to ${Math.round(base * 1.4)}%`,
        `Max concurrent positions: ${p.riskTolerance === "reckless" ? 12 : p.riskTolerance === "high" ? 9 : 7}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 22 : p.riskTolerance === "high" ? 18 : 15;
      return `- Max portfolio drawdown: ${dd}% from high-water mark → reduce exposure by 50%\n- Growth stock volatility is expected — accept wider daily swings\n- Max single-position concentration: ${Math.round(p.convictionMultiplier * 18)}%`;
    },
  },

  income: {
    entryRules: () => [
      "Dividend yield score > 0.65 (top-tier yield relative to stock's own history)",
      "Current ratio score > 0.55 (financial stability to sustain dividend payments)",
      "Volatility score > 0.55 (prefer lower-volatility, stable businesses)",
      "FCF yield score > 0.50 (strong free cash flow supports dividend sustainability)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 30 : p.riskTolerance === "high" ? 25 : p.riskTolerance === "medium" ? 20 : 18;
      return [
        `Wide trailing stop: sell only if price drops ${stopPct}% from trailing high (income stocks need room)`,
        "Dividend yield score drops below 0.30 (yield declining — possible dividend cut risk)",
        "Current ratio score falls below 0.25 (financial health deteriorating — dividend at risk)",
        "Do NOT exit purely on price momentum — hold for income unless fundamentals crack",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 14 : p.riskTolerance === "high" ? 12 : 10;
      return [
        `Base allocation: ${base}% of portfolio per position`,
        `Income anchor: prefer filling portfolio with 6-8 income positions before any speculative buys`,
        `Max concurrent positions: ${p.riskTolerance === "reckless" ? 10 : p.riskTolerance === "high" ? 8 : 6}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 25 : p.riskTolerance === "high" ? 20 : 15;
      return `- Max portfolio drawdown: ${dd}% → do not panic-sell; review fundamentals first\n- Prioritize dividend sustainability over capital appreciation\n- Max single-position concentration: ${Math.round(p.convictionMultiplier * 12)}%`;
    },
  },

  contrarian: {
    entryRules: () => [
      "RSI score < 0.30 (deeply oversold — potential mean-reversion opportunity)",
      "PE score > 0.70 (cheap on fundamental basis despite price decline)",
      "Momentum score < 0.35 (depressed price action — contrarian opportunity when fundamentals intact)",
      "Current ratio score > 0.45 (company is NOT in financial distress — avoid catching a falling knife)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 20 : p.riskTolerance === "high" ? 17 : p.riskTolerance === "medium" ? 15 : 12;
      return [
        `Trailing stop-loss: sell if price drops ${stopPct}% from entry (thesis was wrong, cut loss)`,
        "RSI rises above 0.60 — take profits (mean reversion complete, crowd has returned)",
        "Time-based exit: if position has not moved +10% within 30 trading days, exit and redeploy",
        "Exit immediately if current ratio drops below 0.25 (financial distress — not contrarian, just broken)",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 14 : p.riskTolerance === "high" ? 11 : 8;
      return [
        `Base allocation: ${base}% of portfolio per position (smaller size due to higher uncertainty)`,
        `Scale-in: if RSI drops further below 0.20 AND fundamentals intact, add up to ${Math.round(base * 0.5)}%`,
        `Max concurrent contrarian bets: ${p.riskTolerance === "reckless" ? 8 : p.riskTolerance === "high" ? 6 : 4}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 20 : p.riskTolerance === "high" ? 16 : 12;
      return `- Max portfolio drawdown: ${dd}% → halt all new contrarian entries until recovery\n- Never have more than 40% of portfolio in contrarian positions\n- Require at least 2 of 3: pe > 0.60, current_ratio > 0.45, fcf > 0.40 before entering`;
    },
  },

  garp: {
    entryRules: () => [
      "Combined signal > 0.58 (balanced quality across all factors)",
      "EPS trend score > 0.55 AND PE score > 0.50 (growing but still reasonably priced)",
      "ROE score > 0.55 (quality management deploying capital effectively)",
      "Momentum score > 0.45 (price action confirms fundamental quality — avoid value traps)",
    ],
    exitRules: (p) => {
      const stopPct = p.riskTolerance === "reckless" ? 20 : p.riskTolerance === "high" ? 18 : p.riskTolerance === "medium" ? 15 : 12;
      return [
        `Trailing stop-loss: sell if price drops ${stopPct}% from trailing high`,
        "Combined signal drops below 0.40 (overall quality deteriorating)",
        "PE score drops below 0.35 AND eps_trend drops below 0.40 (no longer growth at reasonable price)",
        "Profit target: 25-30% gain — take partial profits, trail remainder",
      ];
    },
    sizingRules: (p) => {
      const base = p.riskTolerance === "reckless" ? 15 : p.riskTolerance === "high" ? 12 : 10;
      return [
        `Base allocation: ${base}% of portfolio per position`,
        `Quality premium: if roe > 0.65 AND eps_trend > 0.60 AND pe > 0.55, allocate up to ${Math.round(base * 1.3)}%`,
        `Max concurrent positions: ${p.riskTolerance === "reckless" ? 12 : p.riskTolerance === "high" ? 9 : 7}`,
      ];
    },
    riskManagement: (p) => {
      const dd = p.riskTolerance === "reckless" ? 22 : p.riskTolerance === "high" ? 18 : 14;
      return `- Max portfolio drawdown: ${dd}% from high-water mark → reduce all positions by 50%\n- Sector concentration: max 30% in single GICS sector\n- Require balanced signal profile — avoid one-factor bets`;
    },
  },
};

/**
 * Maps archetype index (0-9) to strategy template for two cycles.
 * Cycle 1 (indices 0-9): natural fit per archetype.
 * Cycle 2 (indices 10-19): different template for diversity.
 */
export const ARCHETYPE_STRATEGY_MAP: StrategyTemplateName[] = [
  // Cycle 1
  "value",       // 0: Goldman analyst
  "garp",        // 1: Self-taught retail
  "income",      // 2: Retired engineer
  "momentum",    // 3: Young aggressive
  "income",      // 4: Cautious professor
  "growth",      // 5: Disciplined technical
  "contrarian",  // 6: Behavioral economist
  "momentum",    // 7: Momentum chaser
  "contrarian",  // 8: Deep value contrarian
  "garp",        // 9: Journalist
  // Cycle 2 (different templates)
  "growth",      // 10: Goldman analyst (2nd)
  "momentum",    // 11: Self-taught retail (2nd)
  "value",       // 12: Retired engineer (2nd)
  "contrarian",  // 13: Young aggressive (2nd)
  "garp",        // 14: Cautious professor (2nd)
  "momentum",    // 15: Disciplined technical (2nd)
  "income",      // 16: Behavioral economist (2nd)
  "growth",      // 17: Momentum chaser (2nd)
  "value",       // 18: Deep value contrarian (2nd)
  "contrarian",  // 19: Journalist (2nd)
];

/** Format a persona as strategy.md with a specific strategy template. */
export function formatStrategyMdDiverse(
  persona: TraderPersona,
  templateName: StrategyTemplateName,
): string {
  const template = STRATEGY_TEMPLATES[templateName];
  const watchlistStr = persona.watchlist.join(", ");

  const entryRules = template.entryRules(persona);
  const exitRules = template.exitRules(persona);
  const sizing = template.sizingRules(persona);
  const risk = template.riskManagement(persona);

  return `# ${persona.name} — Trading Strategy (${templateName.toUpperCase()})

## Approach
${templateName.charAt(0).toUpperCase() + templateName.slice(1)} strategy

## Watchlist
${watchlistStr}

## Entry Rules
${entryRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Exit Rules
${exitRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Position Sizing
${sizing.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Risk Management
${risk}

## Self-Identified Weaknesses
- (To be updated by evolution engine after first week of trading)

## Strategy Changelog
- Initialized: ${new Date().toISOString().split("T")[0]} (template: ${templateName})
`;
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
