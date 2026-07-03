const FMP_BASE = "https://financialmodelingprep.com/stable";

function apiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY env var not set");
  return key;
}

// ---- Types ----

export interface FMPQuote {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  changePercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearLow: number;
  yearHigh: number;
  volume: number;
  previousClose: number;
  open: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
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

export interface CompanyProfile {
  companyName: string;
  sector: string;
  industry: string;
  ceo: string;
  employees: string;
  country: string;
  beta: number | null;
  website: string;
  ipoDate: string;
  description: string;
  image: string;
}

export interface FundamentalsTTM {
  valuation: {
    pe: number | null;
    peg: number | null;
    ps: number | null;
    pb: number | null;
    pFcf: number | null;
    evEbitda: number | null;
    evSales: number | null;
    earningsYield: number | null;
    fcfYield: number | null;
    priceToFairValue: number | null;
  };
  profitability: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
    roa: number | null;
    roic: number | null;
    roce: number | null;
  };
  health: {
    currentRatio: number | null;
    quickRatio: number | null;
    cashRatio: number | null;
    debtToEquity: number | null;
    interestCoverage: number | null;
    netDebtToEbitda: number | null;
  };
  perShare: {
    eps: number | null;
    revenuePerShare: number | null;
    bookValuePerShare: number | null;
    fcfPerShare: number | null;
    cashPerShare: number | null;
    dividendPerShare: number | null;
  };
  dividend: {
    yield: number | null;
    payoutRatio: number | null;
  };
  efficiency: {
    assetTurnover: number | null;
    inventoryTurnover: number | null;
    receivablesTurnover: number | null;
    daysSalesOutstanding: number | null;
    daysInventoryOutstanding: number | null;
    cashConversionCycle: number | null;
    grahamNumber: number | null;
    effectiveTaxRate: number | null;
  };
}

export interface AnalystView {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  consensus: string;
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  targetConsensus: number | null;
}

export interface StockRating {
  rating: string;
  overallScore: number | null;
  dcfScore: number | null;
  roeScore: number | null;
  roaScore: number | null;
  deScore: number | null;
  peScore: number | null;
  pbScore: number | null;
}

export interface NextEarnings {
  date: string;
  epsEstimated: number | null;
  revenueEstimated: number | null;
}

export interface StockPeer {
  symbol: string;
  companyName: string;
  price: number | null;
}

export interface IncomeStatement {
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netIncome: number | null;
  eps: number | null;
  epsDiluted: number | null;
  researchAndDevelopment: number | null;
  interestExpense: number | null;
  incomeTax: number | null;
}

export interface BalanceSheet {
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  inventory: number | null;
  retainedEarnings: number | null;
}

export interface CashFlowStatement {
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  stockBasedComp: number | null;
  dividendsPaid: number | null;
  buybacks: number | null;
  netChangeInCash: number | null;
}

export interface FinancialStatements {
  period: string;
  fiscalYear: string;
  income: IncomeStatement | null;
  balance: BalanceSheet | null;
  cashflow: CashFlowStatement | null;
}

export interface ForwardEstimate {
  date: string;
  revenueAvg: number | null;
  ebitdaAvg: number | null;
  netIncomeAvg: number | null;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  numAnalysts: number | null;
}

export interface DividendPayment {
  date: string;
  amount: number;
  frequency: string;
}

export interface RatingAction {
  date: string;
  company: string;
  action: string;
  fromGrade: string;
  toGrade: string;
}

export interface Technicals {
  rsi14: number | null;
  sma20: number | null;
  ema50: number | null;
}

// ---- Simple in-memory cache with in-flight deduplication ----
const _cache = new Map<string, { data: unknown; ts: number }>();
const _inflight = new Map<string, Promise<unknown>>();
// Bound the cache so a caller sweeping many distinct symbols can't grow it
// without limit (Map preserves insertion order, so the oldest key is evicted).
const MAX_CACHE_ENTRIES = 1000;

function cached<T>(key: string, ttlMs: number, fetchFn: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data as T);

  // Deduplicate concurrent fetches for the same key
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetchFn().then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    if (_cache.size > MAX_CACHE_ENTRIES) {
      const oldest = _cache.keys().next().value;
      if (oldest !== undefined) _cache.delete(oldest);
    }
    _inflight.delete(key);
    return data;
  }).catch((e) => {
    _inflight.delete(key);
    throw e;
  });

  _inflight.set(key, promise);
  return promise;
}

// ---- FMPClient ----

export class FMPClient {
  private key: string;

  constructor() {
    this.key = apiKey();
  }

  /**
   * Single quote with 60s caching. Uses query-param style required by /stable API.
   * Returns null only when FMP confirms the symbol is unknown (empty array);
   * throws on an upstream failure (non-2xx) so callers can distinguish
   * "not found" from "provider error". Projects the raw response into a stable
   * FMPQuote DTO rather than casting, so upstream field drift is caught here.
   */
  async getQuote(ticker: string): Promise<FMPQuote | null> {
    const key = `quote:${ticker}`;
    return cached(key, 60_000, async () => {
      const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(ticker)}&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FMP quote error: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const q = data[0];
      return {
        symbol: q.symbol,
        name: q.name ?? q.symbol,
        exchange: q.exchange ?? "",
        price: q.price,
        changePercentage: q.changePercentage ?? 0,
        change: q.change ?? 0,
        dayLow: q.dayLow ?? q.price,
        dayHigh: q.dayHigh ?? q.price,
        yearLow: q.yearLow ?? 0,
        yearHigh: q.yearHigh ?? 0,
        volume: q.volume ?? 0,
        previousClose: q.previousClose ?? q.price,
        open: q.open ?? q.price,
        marketCap: q.marketCap ?? 0,
        priceAvg50: q.priceAvg50 ?? 0,
        priceAvg200: q.priceAvg200 ?? 0,
      };
    });
  }

  /** Batch quotes — fetches individually (batch endpoint not available on current plan). */
  async getBatchQuotes(tickers: string[]): Promise<Record<string, FMPQuote>> {
    if (tickers.length === 0) return {};
    const results = await Promise.allSettled(
      tickers.map((t) => this.getQuote(t))
    );
    const out: Record<string, FMPQuote> = {};
    const failed: string[] = [];
    for (let i = 0; i < tickers.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value) {
        out[tickers[i]] = r.value;
      } else {
        failed.push(tickers[i]);
      }
    }
    if (failed.length > 0) {
      console.warn(`[fmp] Batch quotes: ${failed.length}/${tickers.length} failed — ${failed.join(", ")}`);
    }
    return out;
  }

  /** Historical daily OHLCV, cached for 1 hour. */
  async getDailyOHLC(ticker: string, from: string, to: string): Promise<OHLCV[]> {
    const key = `ohlc:${ticker}:${from}:${to}`;
    return cached(key, 60 * 60 * 1000, async () => {
      const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FMP OHLC error: ${res.status}`);
      const data = await res.json();
      // FMP returns { symbol, historical: [...] }
      const raw = data.historical ?? data ?? [];
      const historical: OHLCV[] = [];
      for (const d of raw) {
        if (!d.date || typeof d.close !== "number" || d.close <= 0) {
          continue; // Skip invalid bars
        }
        historical.push({
          date: d.date,
          open: typeof d.open === "number" ? d.open : d.close,
          high: typeof d.high === "number" ? d.high : d.close,
          low: typeof d.low === "number" ? d.low : d.close,
          close: d.close,
          volume: typeof d.volume === "number" ? d.volume : 0,
        });
      }
      if (historical.length === 0 && raw.length > 0) {
        console.warn(`[fmp] ${ticker}: all ${raw.length} OHLCV bars failed validation`);
      }
      return historical.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  /** Financial ratios (quarterly), cached for 24 hours. */
  async getFinancialRatios(ticker: string): Promise<FinancialRatios[]> {
    const key = `ratios:${ticker}`;
    return cached(key, 24 * 60 * 60 * 1000, async () => {
      const url = `${FMP_BASE}/ratios?symbol=${encodeURIComponent(ticker)}&limit=40&apikey=${this.key}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: any[] = await res.json();
      return data.map((d) => ({
        date: d.date,
        period: d.period,
        // FMP /stable/ratios field names differ from the legacy v3 API.
        peRatio: d.priceToEarningsRatio ?? null,
        priceToBookRatio: d.priceToBookRatio ?? null,
        currentRatio: d.currentRatio ?? null,
        dividendYield: d.dividendYield ?? null,
        eps: d.netIncomePerShare ?? null,
        bookValuePerShare: d.bookValuePerShare ?? null,
        // /stable/ratios has no ROE field; derive it: net income / equity
        // = (netIncome/shares) / (equity/shares) = NIPS / equityPerShare.
        roe:
          d.netIncomePerShare != null && d.shareholdersEquityPerShare
            ? d.netIncomePerShare / d.shareholdersEquityPerShare
            : null,
        freeCashFlowPerShare: d.freeCashFlowPerShare ?? null,
      }));
    });
  }

  /** Company profile (sector, industry, description, etc.), cached 24h. */
  async getProfile(ticker: string): Promise<CompanyProfile | null> {
    return cached(`profile:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const res = await fetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${this.key}`);
      if (!res.ok) return null;
      const d = (await res.json())?.[0];
      if (!d) return null;
      return {
        companyName: d.companyName ?? ticker,
        sector: d.sector ?? "",
        industry: d.industry ?? "",
        ceo: d.ceo ?? "",
        employees: d.fullTimeEmployees ?? "",
        country: d.country ?? "",
        beta: d.beta ?? null,
        website: d.website ?? "",
        ipoDate: d.ipoDate ?? "",
        description: d.description ?? "",
        image: d.image ?? "",
      };
    });
  }

  /** TTM fundamentals merged from /ratios-ttm and /key-metrics-ttm, cached 24h. */
  async getFundamentalsTTM(ticker: string): Promise<FundamentalsTTM | null> {
    return cached(`fundttm:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const sym = encodeURIComponent(ticker);
      const [rRes, kRes] = await Promise.all([
        fetch(`${FMP_BASE}/ratios-ttm?symbol=${sym}&apikey=${this.key}`),
        fetch(`${FMP_BASE}/key-metrics-ttm?symbol=${sym}&apikey=${this.key}`),
      ]);
      const r = rRes.ok ? (await rRes.json())?.[0] : null;
      const k = kRes.ok ? (await kRes.json())?.[0] : null;
      if (!r && !k) return null;
      const rr = r ?? {};
      const kk = k ?? {};
      return {
        valuation: {
          pe: rr.priceToEarningsRatioTTM ?? null,
          peg: rr.priceToEarningsGrowthRatioTTM ?? null,
          ps: rr.priceToSalesRatioTTM ?? null,
          pb: rr.priceToBookRatioTTM ?? null,
          pFcf: rr.priceToFreeCashFlowRatioTTM ?? null,
          evEbitda: kk.evToEBITDATTM ?? null,
          evSales: kk.evToSalesTTM ?? null,
          earningsYield: kk.earningsYieldTTM ?? null,
          fcfYield: kk.freeCashFlowYieldTTM ?? null,
          priceToFairValue: rr.priceToFairValueTTM ?? null,
        },
        profitability: {
          grossMargin: rr.grossProfitMarginTTM ?? null,
          operatingMargin: rr.operatingProfitMarginTTM ?? null,
          netMargin: rr.netProfitMarginTTM ?? null,
          roe: kk.returnOnEquityTTM ?? null,
          roa: kk.returnOnAssetsTTM ?? null,
          roic: kk.returnOnInvestedCapitalTTM ?? null,
          roce: kk.returnOnCapitalEmployedTTM ?? null,
        },
        health: {
          currentRatio: rr.currentRatioTTM ?? null,
          quickRatio: rr.quickRatioTTM ?? null,
          cashRatio: rr.cashRatioTTM ?? null,
          debtToEquity: rr.debtToEquityRatioTTM ?? null,
          interestCoverage: rr.interestCoverageRatioTTM ?? null,
          netDebtToEbitda: kk.netDebtToEBITDATTM ?? null,
        },
        perShare: {
          eps: rr.netIncomePerShareTTM ?? null,
          revenuePerShare: rr.revenuePerShareTTM ?? null,
          bookValuePerShare: rr.bookValuePerShareTTM ?? null,
          fcfPerShare: rr.freeCashFlowPerShareTTM ?? null,
          cashPerShare: rr.cashPerShareTTM ?? null,
          dividendPerShare: rr.dividendPerShareTTM ?? null,
        },
        dividend: {
          yield: rr.dividendYieldTTM ?? null,
          payoutRatio: rr.dividendPayoutRatioTTM ?? null,
        },
        efficiency: {
          assetTurnover: rr.assetTurnoverTTM ?? null,
          inventoryTurnover: rr.inventoryTurnoverTTM ?? null,
          receivablesTurnover: rr.receivablesTurnoverTTM ?? null,
          daysSalesOutstanding: kk.daysOfSalesOutstandingTTM ?? null,
          daysInventoryOutstanding: kk.daysOfInventoryOutstandingTTM ?? null,
          cashConversionCycle: kk.cashConversionCycleTTM ?? null,
          grahamNumber: kk.grahamNumberTTM ?? null,
          effectiveTaxRate: rr.effectiveTaxRateTTM ?? null,
        },
      };
    });
  }

  /** Analyst consensus (grades + price targets), cached 6h. */
  async getAnalystView(ticker: string): Promise<AnalystView | null> {
    return cached(`analyst:${ticker}`, 6 * 60 * 60 * 1000, async () => {
      const sym = encodeURIComponent(ticker);
      const [gRes, tRes] = await Promise.all([
        fetch(`${FMP_BASE}/grades-consensus?symbol=${sym}&apikey=${this.key}`),
        fetch(`${FMP_BASE}/price-target-consensus?symbol=${sym}&apikey=${this.key}`),
      ]);
      const g = gRes.ok ? (await gRes.json())?.[0] : null;
      const t = tRes.ok ? (await tRes.json())?.[0] : null;
      if (!g && !t) return null;
      return {
        strongBuy: g?.strongBuy ?? 0,
        buy: g?.buy ?? 0,
        hold: g?.hold ?? 0,
        sell: g?.sell ?? 0,
        strongSell: g?.strongSell ?? 0,
        consensus: g?.consensus ?? "",
        targetHigh: t?.targetHigh ?? null,
        targetLow: t?.targetLow ?? null,
        targetMedian: t?.targetMedian ?? null,
        targetConsensus: t?.targetConsensus ?? null,
      };
    });
  }

  /** FMP ratings snapshot (letter grade + factor scores), cached 24h. */
  async getRating(ticker: string): Promise<StockRating | null> {
    return cached(`rating:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const res = await fetch(`${FMP_BASE}/ratings-snapshot?symbol=${encodeURIComponent(ticker)}&apikey=${this.key}`);
      if (!res.ok) return null;
      const d = (await res.json())?.[0];
      if (!d) return null;
      return {
        rating: d.rating ?? "",
        overallScore: d.overallScore ?? null,
        dcfScore: d.discountedCashFlowScore ?? null,
        roeScore: d.returnOnEquityScore ?? null,
        roaScore: d.returnOnAssetsScore ?? null,
        deScore: d.debtToEquityScore ?? null,
        peScore: d.priceToEarningsScore ?? null,
        pbScore: d.priceToBookScore ?? null,
      };
    });
  }

  /** Latest technical indicators (RSI 14, SMA 20, EMA 50; daily), cached 1h. */
  async getTechnicals(ticker: string): Promise<Technicals | null> {
    return cached(`tech:${ticker}`, 60 * 60 * 1000, async () => {
      const sym = encodeURIComponent(ticker);
      const indicator = async (type: string, period: number): Promise<number | null> => {
        const res = await fetch(
          `${FMP_BASE}/technical-indicators/${type}?symbol=${sym}&periodLength=${period}&timeframe=1day&apikey=${this.key}`
        );
        if (!res.ok) return null;
        const d = await res.json();
        return Array.isArray(d) && typeof d[0]?.[type] === "number" ? d[0][type] : null;
      };
      const [rsi14, sma20, ema50] = await Promise.all([
        indicator("rsi", 14),
        indicator("sma", 20),
        indicator("ema", 50),
      ]);
      if (rsi14 == null && sma20 == null && ema50 == null) return null;
      return { rsi14, sma20, ema50 };
    });
  }

  /** Latest annual financial statements (income, balance, cash flow), cached 24h. */
  async getStatements(ticker: string): Promise<FinancialStatements | null> {
    return cached(`statements:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const sym = encodeURIComponent(ticker);
      const [iRes, bRes, cRes] = await Promise.all([
        fetch(`${FMP_BASE}/income-statement?symbol=${sym}&limit=1&apikey=${this.key}`),
        fetch(`${FMP_BASE}/balance-sheet-statement?symbol=${sym}&limit=1&apikey=${this.key}`),
        fetch(`${FMP_BASE}/cash-flow-statement?symbol=${sym}&limit=1&apikey=${this.key}`),
      ]);
      const i = iRes.ok ? (await iRes.json())?.[0] : null;
      const b = bRes.ok ? (await bRes.json())?.[0] : null;
      const c = cRes.ok ? (await cRes.json())?.[0] : null;
      if (!i && !b && !c) return null;
      return {
        period: i?.period ?? b?.period ?? c?.period ?? "",
        fiscalYear: String(i?.fiscalYear ?? b?.fiscalYear ?? c?.fiscalYear ?? ""),
        income: i
          ? {
              revenue: i.revenue ?? null,
              grossProfit: i.grossProfit ?? null,
              operatingIncome: i.operatingIncome ?? null,
              ebitda: i.ebitda ?? null,
              netIncome: i.netIncome ?? null,
              eps: i.eps ?? null,
              epsDiluted: i.epsDiluted ?? null,
              researchAndDevelopment: i.researchAndDevelopmentExpenses ?? null,
              interestExpense: i.interestExpense ?? null,
              incomeTax: i.incomeTaxExpense ?? null,
            }
          : null,
        balance: b
          ? {
              totalAssets: b.totalAssets ?? null,
              totalLiabilities: b.totalLiabilities ?? null,
              totalEquity: b.totalStockholdersEquity ?? b.totalEquity ?? null,
              cash: b.cashAndCashEquivalents ?? null,
              totalDebt: b.totalDebt ?? null,
              netDebt: b.netDebt ?? null,
              currentAssets: b.totalCurrentAssets ?? null,
              currentLiabilities: b.totalCurrentLiabilities ?? null,
              inventory: b.inventory ?? null,
              retainedEarnings: b.retainedEarnings ?? null,
            }
          : null,
        cashflow: c
          ? {
              operatingCashFlow: c.operatingCashFlow ?? null,
              capex: c.capitalExpenditure != null ? Math.abs(c.capitalExpenditure) : null,
              freeCashFlow: c.freeCashFlow ?? null,
              stockBasedComp: c.stockBasedCompensation ?? null,
              dividendsPaid:
                c.commonDividendsPaid != null
                  ? Math.abs(c.commonDividendsPaid)
                  : c.netDividendsPaid != null
                    ? Math.abs(c.netDividendsPaid)
                    : null,
              buybacks: c.commonStockRepurchased != null ? Math.abs(c.commonStockRepurchased) : null,
              netChangeInCash: c.netChangeInCash ?? null,
            }
          : null,
      };
    });
  }

  /** Nearest upcoming annual analyst estimate, cached 24h. */
  async getForwardEstimate(ticker: string): Promise<ForwardEstimate | null> {
    return cached(`estimate:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const res = await fetch(
        `${FMP_BASE}/analyst-estimates?symbol=${encodeURIComponent(ticker)}&period=annual&limit=10&apikey=${this.key}`
      );
      if (!res.ok) return null;
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const today = new Date().toISOString().split("T")[0];
      const future = arr
        .filter((e) => e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      const d = future[0] ?? arr[0];
      return {
        date: d.date,
        revenueAvg: d.revenueAvg ?? null,
        ebitdaAvg: d.ebitdaAvg ?? null,
        netIncomeAvg: d.netIncomeAvg ?? null,
        epsAvg: d.epsAvg ?? null,
        epsLow: d.epsLow ?? null,
        epsHigh: d.epsHigh ?? null,
        numAnalysts: d.numAnalystsEps ?? d.numAnalystsRevenue ?? null,
      };
    });
  }

  /** Recent dividend payments, cached 24h. */
  async getDividendHistory(ticker: string, limit = 6): Promise<DividendPayment[]> {
    return cached(`divhist:${ticker}:${limit}`, 24 * 60 * 60 * 1000, async () => {
      const res = await fetch(
        `${FMP_BASE}/dividends?symbol=${encodeURIComponent(ticker)}&limit=${limit}&apikey=${this.key}`
      );
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((d) => typeof d.dividend === "number")
        .map((d) => ({ date: d.date, amount: d.dividend, frequency: d.frequency ?? "" }));
    });
  }

  /** Recent individual analyst rating actions (upgrades/downgrades), cached 6h. */
  async getRatingActions(ticker: string, limit = 6): Promise<RatingAction[]> {
    return cached(`grades:${ticker}:${limit}`, 6 * 60 * 60 * 1000, async () => {
      const res = await fetch(
        `${FMP_BASE}/grades?symbol=${encodeURIComponent(ticker)}&limit=${limit}&apikey=${this.key}`
      );
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.map((g) => ({
        date: g.date,
        company: g.gradingCompany ?? "",
        action: g.action ?? "",
        fromGrade: g.previousGrade ?? "",
        toGrade: g.newGrade ?? "",
      }));
    });
  }

  /** Next (or most recent) earnings date + estimates, cached 6h. */
  async getNextEarnings(ticker: string): Promise<NextEarnings | null> {
    return cached(`earnings:${ticker}`, 6 * 60 * 60 * 1000, async () => {
      const res = await fetch(`${FMP_BASE}/earnings?symbol=${encodeURIComponent(ticker)}&limit=12&apikey=${this.key}`);
      if (!res.ok) return null;
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const today = new Date().toISOString().split("T")[0];
      const upcoming = arr
        .filter((e) => e.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const d = upcoming ?? arr[0];
      return {
        date: d.date,
        epsEstimated: d.epsEstimated ?? null,
        revenueEstimated: d.revenueEstimated ?? null,
      };
    });
  }

  /** Peer companies, cached 24h. */
  async getPeers(ticker: string): Promise<StockPeer[]> {
    return cached(`peers:${ticker}`, 24 * 60 * 60 * 1000, async () => {
      const res = await fetch(`${FMP_BASE}/stock-peers?symbol=${encodeURIComponent(ticker)}&apikey=${this.key}`);
      if (!res.ok) return [];
      const arr = await res.json();
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, 8).map((p) => ({
        symbol: p.symbol,
        companyName: p.companyName ?? p.symbol,
        price: p.price ?? null,
      }));
    });
  }

  /**
   * Check if the market is open on a given date by comparing the latest
   * SPY quote date to the target date.
   */
  async isMarketOpen(date: string): Promise<boolean> {
    // Retry once on failure to distinguish network errors from market closed
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const quote = await this.getQuote("SPY");
        if (!quote) return false;
        return quote.price > 0;
      } catch (e) {
        if (attempt === 0) {
          console.warn(`[fmp] isMarketOpen check failed (attempt 1), retrying: ${(e as Error).message}`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          console.error(`[fmp] isMarketOpen check failed after retry: ${(e as Error).message}`);
          return false;
        }
      }
    }
    return false;
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
