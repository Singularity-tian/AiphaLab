/**
 * Signal computation — TypeScript port of AlphaLab Python factors.
 * All scores are in [0, 1] where 1.0 = bullish, 0.0 = bearish.
 */

import { FMPClient, FinancialRatios, OHLCV } from "./fmp";

export interface SignalResult {
  combined: number;
  factors: Record<string, number>;
  confidence: number;
}

// ---- Percentile rank (expanding window, no look-ahead) ----

function percentileRank(series: number[], value: number): number {
  if (series.length === 0) return 0.5;
  const below = series.filter((v) => v < value).length;
  return below / series.length;
}

// ---- Graham Value factors ----

function peScore(ratios: FinancialRatios[]): number {
  const valid = ratios.map((r) => r.peRatio).filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  // Lower PE is better → invert percentile
  return 1 - percentileRank(valid.slice(1), current);
}

function pbScore(ratios: FinancialRatios[]): number {
  const valid = ratios
    .map((r) => r.priceToBookRatio)
    .filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  return 1 - percentileRank(valid.slice(1), current);
}

function currentRatioScore(ratios: FinancialRatios[]): number {
  const valid = ratios
    .map((r) => r.currentRatio)
    .filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  // Higher current ratio is better
  return percentileRank(valid.slice(1), current);
}

function dividendYieldScore(ratios: FinancialRatios[]): number {
  const valid = ratios
    .map((r) => r.dividendYield)
    .filter((v): v is number => v !== null && v >= 0);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  return percentileRank(valid.slice(1), current);
}

function epsTrendScore(ratios: FinancialRatios[]): number {
  const valid = ratios.map((r) => r.eps).filter((v): v is number => v !== null);
  if (valid.length < 4) return 0.5;
  // Is the most recent EPS above the 4-period average?
  const avg = valid.slice(1, 5).reduce((a, b) => a + b, 0) / 4;
  if (avg === 0) return 0.5;
  const ratio = valid[0] / avg;
  // Sigmoid centered at 1.0
  return 1 / (1 + Math.exp(-5 * (ratio - 1)));
}

// ---- Momentum factor ----

function momentumScore(ohlcv: OHLCV[], asOfDate: string): number {
  const bars = ohlcv.filter((b) => b.date <= asOfDate);
  if (bars.length < 252) return 0.5;
  const latest = bars[bars.length - 1].close;
  const oneMonthAgo = bars[bars.length - 22]?.close ?? latest;
  const twelveMonthsAgo = bars[bars.length - 252]?.close ?? bars[0].close;
  // 12-1 momentum: 12m return minus 1m return
  const r12 = (latest - twelveMonthsAgo) / twelveMonthsAgo;
  const r1 = (latest - oneMonthAgo) / oneMonthAgo;
  const momentum = r12 - r1;
  // Map via sigmoid: positive momentum → > 0.5
  return 1 / (1 + Math.exp(-5 * momentum));
}

// ---- Combined signal ----

export async function computeSignals(
  ticker: string,
  asOfDate: string,
  fmp: FMPClient,
  strategy: "graham_value" | "momentum" | "blended" = "graham_value"
): Promise<SignalResult> {
  try {
    const [ratios, ohlcv] = await Promise.all([
      fmp.getFinancialRatios(ticker),
      fmp.getDailyOHLC(ticker, subtractDays(asOfDate, 400), asOfDate),
    ]);

    const factors: Record<string, number> = {};

    if (strategy === "graham_value" || strategy === "blended") {
      factors.pe = peScore(ratios);
      factors.pb = pbScore(ratios);
      factors.current_ratio = currentRatioScore(ratios);
      factors.dividend_yield = dividendYieldScore(ratios);
      factors.eps_trend = epsTrendScore(ratios);
    }

    if (strategy === "momentum" || strategy === "blended") {
      factors.momentum = momentumScore(ohlcv, asOfDate);
    }

    const values = Object.values(factors);
    const combined = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;
    const confidence = Math.min(ratios.length / 8, 1.0);

    return { combined, factors, confidence };
  } catch {
    return { combined: 0.5, factors: {}, confidence: 0 };
  }
}

/** Compute signals for multiple tickers, returns map of ticker → signal. */
export async function computeBatchSignals(
  tickers: string[],
  asOfDate: string,
  fmp: FMPClient,
  strategy: "graham_value" | "momentum" | "blended" = "graham_value"
): Promise<Record<string, SignalResult>> {
  const results = await Promise.allSettled(
    tickers.map((t) => computeSignals(t, asOfDate, fmp, strategy))
  );
  return Object.fromEntries(
    tickers.map((t, i) => {
      const r = results[i];
      return [t, r.status === "fulfilled" ? r.value : { combined: 0.5, factors: {}, confidence: 0 }];
    })
  );
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
