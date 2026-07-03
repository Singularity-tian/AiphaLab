import {
  getFmp,
  type FMPQuote,
  type OHLCV,
  type CompanyProfile,
  type FundamentalsTTM,
  type AnalystView,
  type StockRating,
  type Technicals,
  type NextEarnings,
  type ForwardEstimate,
  type DividendPayment,
  type RatingAction,
  type FinancialStatements,
  type StockPeer,
} from "@/lib/fmp";

export interface StockBundle {
  quote: FMPQuote;
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

/**
 * Full fundamental bundle for one ticker. The quote is the gate: returns null
 * when FMP confirms the symbol is unknown; throws when the quote fetch itself
 * fails upstream. Every other section degrades to null/[] independently.
 */
export async function getStockBundle(ticker: string): Promise<StockBundle | null> {
  const fmp = getFmp();
  const [
    quote, ohlc, profile, fundamentals, analyst, rating, technicals,
    earnings, estimates, dividends, grades, statements, peers,
  ] = await Promise.all([
    fmp.getQuote(ticker),
    fmp.getDailyOHLC(ticker, subDays(90), today()).catch(() => [] as OHLCV[]),
    fmp.getProfile(ticker).catch(() => null),
    fmp.getFundamentalsTTM(ticker).catch(() => null),
    fmp.getAnalystView(ticker).catch(() => null),
    fmp.getRating(ticker).catch(() => null),
    fmp.getTechnicals(ticker).catch(() => null),
    fmp.getNextEarnings(ticker).catch(() => null),
    fmp.getForwardEstimate(ticker).catch(() => null),
    fmp.getDividendHistory(ticker).catch(() => []),
    fmp.getRatingActions(ticker).catch(() => []),
    fmp.getStatements(ticker).catch(() => null),
    fmp.getPeers(ticker).catch(() => []),
  ]);

  if (!quote) return null;

  return {
    quote,
    ohlc: ohlc.slice(-60),
    profile, fundamentals, analyst, rating, technicals,
    earnings, estimates, dividends, grades, statements, peers,
  };
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function subDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
