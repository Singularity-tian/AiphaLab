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

// ---- Quality factors (from already-fetched ratio data) ----

function roeScore(ratios: FinancialRatios[]): number {
  const valid = ratios
    .map((r) => r.roe)
    .filter((v): v is number => v !== null);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  // Higher ROE is better
  return percentileRank(valid.slice(1), current);
}

function fcfYieldScore(ratios: FinancialRatios[]): number {
  const valid = ratios
    .map((r) => r.freeCashFlowPerShare)
    .filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return 0.5;
  const current = valid[0];
  // Higher FCF/share is better
  return percentileRank(valid.slice(1), current);
}

// ---- Technical factors (from already-fetched OHLCV data) ----

function rsiScore(ohlcv: OHLCV[], asOfDate: string): number {
  const bars = ohlcv.filter((b) => b.date <= asOfDate);
  if (bars.length < 16) return 0.5;

  const closes = bars.slice(-15).map((b) => b.close);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= 14;
  avgLoss /= 14;

  if (avgLoss === 0) return 1.0;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  // Normalize to [0, 1]: RSI 0→0, RSI 50→0.5, RSI 100→1
  return rsi / 100;
}

function volatilityScore(ohlcv: OHLCV[], asOfDate: string): number {
  const bars = ohlcv.filter((b) => b.date <= asOfDate);
  if (bars.length < 22) return 0.5;

  const recent = bars.slice(-21);
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    returns.push((recent[i].close - recent[i - 1].close) / recent[i - 1].close);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);
  // Lower volatility → higher score (safer). Sigmoid centered at 30% annualized.
  return 1 / (1 + Math.exp(10 * (annualizedVol - 0.3)));
}

function relativeVolumeScore(ohlcv: OHLCV[], asOfDate: string): number {
  const bars = ohlcv.filter((b) => b.date <= asOfDate);
  if (bars.length < 21) return 0.5;

  const recent = bars.slice(-21);
  const currentVol = recent[recent.length - 1].volume;
  const avgVol = recent.slice(0, -1).reduce((a, b) => a + b.volume, 0) / 20;
  if (avgVol === 0) return 0.5;
  const relVol = currentVol / avgVol;
  // Higher relative volume → higher score. Sigmoid centered at 1.0x average.
  return 1 / (1 + Math.exp(-3 * (relVol - 1.0)));
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
): Promise<SignalResult> {
  let ratios: FinancialRatios[] = [];
  let ohlcv: OHLCV[] = [];

  try {
    [ratios, ohlcv] = await Promise.all([
      fmp.getFinancialRatios(ticker),
      fmp.getDailyOHLC(ticker, subtractDays(asOfDate, 400), asOfDate),
    ]);
  } catch (e) {
    console.warn(`[signals] ${ticker}: data fetch failed — ${(e as Error).message}`);
    return { combined: 0.5, factors: {}, confidence: 0 };
  }

  try {
    const factors: Record<string, number> = {};

    // Value factors (from financial ratios)
    factors.pe = peScore(ratios);
    factors.pb = pbScore(ratios);
    factors.current_ratio = currentRatioScore(ratios);
    factors.dividend_yield = dividendYieldScore(ratios);
    factors.eps_trend = epsTrendScore(ratios);
    factors.roe = roeScore(ratios);
    factors.fcf_yield = fcfYieldScore(ratios);

    // Technical factors (from OHLCV — require sufficient history)
    if (ohlcv.length < 22) {
      console.warn(`[signals] ${ticker}: only ${ohlcv.length} OHLCV bars (need ≥22 for technicals)`);
    }
    factors.momentum = momentumScore(ohlcv, asOfDate);
    factors.rsi = rsiScore(ohlcv, asOfDate);
    factors.volatility = volatilityScore(ohlcv, asOfDate);
    factors.relative_volume = relativeVolumeScore(ohlcv, asOfDate);

    const values = Object.values(factors);
    const combined = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;
    const confidence = Math.min(ratios.length / 8, 1.0);

    return { combined, factors, confidence };
  } catch (e) {
    console.warn(`[signals] ${ticker}: factor computation failed — ${(e as Error).message}`);
    return { combined: 0.5, factors: {}, confidence: 0 };
  }
}

/** Compute signals for multiple tickers, returns map of ticker → signal. */
export async function computeBatchSignals(
  tickers: string[],
  asOfDate: string,
  fmp: FMPClient,
): Promise<Record<string, SignalResult>> {
  const results = await Promise.allSettled(
    tickers.map((t) => computeSignals(t, asOfDate, fmp))
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
