"use client";

import { useState, useCallback, useRef } from "react";

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  previousClose: number;
  open: number;
  marketCap: number;
  exchange: string;
  yearHigh: number;
  yearLow: number;
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

export interface StockData {
  quote: StockQuote;
  ohlc: OHLCV[];
  profile: CompanyProfile | null;
  fundamentals: FundamentalsTTM | null;
  analyst: AnalystView | null;
  rating: StockRating | null;
  technicals: Technicals | null;
  earnings: NextEarnings | null;
  estimates: ForwardEstimate | null;
  dividends: DividendPayment[];
  grades: RatingAction[];
  statements: FinancialStatements | null;
  peers: StockPeer[];
}

export function useStock() {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const reqId = useRef(0);

  const search = useCallback(async (ticker: string) => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;

    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    // Keep any existing result on screen while the new one loads (no blank flash).

    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (id !== reqId.current) return; // superseded by a newer search
      if (!res.ok) {
        setError(json.error ?? "Failed to load data");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      if (id !== reqId.current) return;
      setError("Network error");
      setData(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    reqId.current++; // cancel any in-flight response
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, search, clear };
}
