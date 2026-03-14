const FMP_BASE = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY env var not set");
  return key;
}

// ---- Types ----

export interface FMPQuote {
  symbol: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  previousClose: number;
  open: number;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FinancialRatios {
  date: string;
  period: string;
  peRatio: number | null;
  priceToBookRatio: number | null;
  currentRatio: number | null;
  dividendYield: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  roe: number | null;
  freeCashFlowPerShare: number | null;
}

// ---- Simple in-memory cache for the process lifetime ----
const _cache = new Map<string, { data: unknown; ts: number }>();
function cached<T>(key: string, ttlMs: number, fetch: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data as T);
  return fetch().then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ---- FMPClient ----

export class FMPClient {
  private key: string;

  constructor() {
    this.key = apiKey();
  }

  /** Single quote with 60s caching. Uses query-param style required by /stable API. */
  async getQuote(ticker: string): Promise<FMPQuote | null> {
    const key = `quote:${ticker}`;
    return cached(key, 60_000, async () => {
      const url = `${FMP_BASE}/quote?symbol=${ticker}&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      return data[0] as FMPQuote;
    });
  }

  /** Batch quotes — fetches individually (batch endpoint not available on current plan). */
  async getBatchQuotes(tickers: string[]): Promise<Record<string, FMPQuote>> {
    if (tickers.length === 0) return {};
    const results = await Promise.allSettled(
      tickers.map((t) => this.getQuote(t))
    );
    const out: Record<string, FMPQuote> = {};
    for (let i = 0; i < tickers.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value) out[tickers[i]] = r.value;
    }
    return out;
  }

  /** Historical daily OHLCV, cached for 1 hour. */
  async getDailyOHLC(ticker: string, from: string, to: string): Promise<OHLCV[]> {
    const key = `ohlc:${ticker}:${from}:${to}`;
    return cached(key, 60 * 60 * 1000, async () => {
      const url = `${FMP_BASE}/historical-price-eod/full?symbol=${ticker}&from=${from}&to=${to}&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FMP OHLC error: ${res.status}`);
      const data = await res.json();
      // FMP returns { symbol, historical: [...] }
      const historical: OHLCV[] = (data.historical ?? data ?? []).map((d: any) => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));
      return historical.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  /** Financial ratios (quarterly), cached for 24 hours. */
  async getFinancialRatios(ticker: string): Promise<FinancialRatios[]> {
    const key = `ratios:${ticker}`;
    return cached(key, 24 * 60 * 60 * 1000, async () => {
      const url = `${FMP_BASE}/ratios?symbol=${ticker}&limit=40&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: any[] = await res.json();
      return data.map((d) => ({
        date: d.date,
        period: d.period,
        peRatio: d.peRatio ?? null,
        priceToBookRatio: d.priceToBookRatio ?? null,
        currentRatio: d.currentRatio ?? null,
        dividendYield: d.dividendYield ?? null,
        eps: d.eps ?? null,
        bookValuePerShare: d.bookValuePerShare ?? null,
        roe: d.returnOnEquity ?? null,
        freeCashFlowPerShare: d.freeCashFlowPerShare ?? null,
      }));
    });
  }

  /**
   * Check if the market is open on a given date by comparing the latest
   * SPY quote date to the target date.
   */
  async isMarketOpen(date: string): Promise<boolean> {
    try {
      const quote = await this.getQuote("SPY");
      if (!quote) return false;
      // If we can get a non-zero price, market data exists for this date
      return quote.price > 0;
    } catch {
      return false;
    }
  }

  /** Get SPY OHLC for context (last 10 trading days). */
  async getSpyContext(asOfDate: string): Promise<OHLCV[]> {
    const from = subtractDays(asOfDate, 30);
    const data = await this.getDailyOHLC("SPY", from, asOfDate);
    return data.slice(-10);
  }
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// Singleton
let _fmp: FMPClient | null = null;
export function getFmp(): FMPClient {
  if (!_fmp) _fmp = new FMPClient();
  return _fmp;
}
