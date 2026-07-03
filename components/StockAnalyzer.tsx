"use client";

import { useState } from "react";
import { useStock, type StockData } from "@/hooks/useStock";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ---- formatters ----
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return fmt(n);
};

// Apply a formatter only when the value is present, else null (renders as "—").
const nOr = (n: number | null | undefined, f: (x: number) => string): string | null =>
  n == null ? null : f(n);

const pct = (n: number, dp = 1) => (n * 100).toFixed(dp) + "%";
const mult = (n: number) => n.toFixed(1) + "×";
const dec = (n: number, dp = 2) => n.toFixed(dp);
const money = (n: number) => "$" + fmt(n);

type Item = [string, string | null];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, marginTop: 16 }}>
      {children}
    </div>
  );
}

function Grid({ items, minCol = 92 }: { items: Item[]; minCol?: number }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(${minCol}px, 1fr))`,
      gap: 1,
      background: "#27272a",
      borderRadius: 6,
      overflow: "hidden",
    }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: "#111113", padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: value != null ? "#a1a1aa" : "#52525b", marginTop: 2 }}>
            {value ?? "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// Only render a metric grid if at least one value is present.
function hasAny(items: Item[]) {
  return items.some(([, v]) => v != null);
}

function AnalystSection({ data }: { data: StockData }) {
  const a = data.analyst;
  if (!a) return null;
  const total = a.strongBuy + a.buy + a.hold + a.sell + a.strongSell;
  const bull = a.strongBuy + a.buy;
  const bear = a.sell + a.strongSell;
  const price = data.quote.price;
  const upside = a.targetConsensus != null && price > 0
    ? (a.targetConsensus - price) / price
    : null;

  return (
    <>
      <SectionLabel>Analyst Consensus{a.consensus ? ` · ${a.consensus}` : ""}</SectionLabel>
      {total > 0 && (
        <>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ flex: bull, background: "#22c55e" }} />
            <div style={{ flex: a.hold, background: "#52525b" }} />
            <div style={{ flex: bear, background: "#ef4444" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#71717a", marginBottom: 4 }}>
            <span style={{ color: "#22c55e" }}>{bull} buy</span>
            <span>{a.hold} hold</span>
            <span style={{ color: "#ef4444" }}>{bear} sell</span>
          </div>
        </>
      )}
      <Grid
        minCol={84}
        items={[
          ["Tgt Low", nOr(a.targetLow, money)],
          ["Tgt Cons.", nOr(a.targetConsensus, money)],
          ["Tgt High", nOr(a.targetHigh, money)],
          ["Upside", upside != null ? (upside >= 0 ? "+" : "") + pct(upside, 1) : null],
        ]}
      />
    </>
  );
}

function RatingSection({ data }: { data: StockData }) {
  const r = data.rating;
  if (!r || !r.rating) return null;
  const scoreColor = (s: number | null) =>
    s == null ? "#52525b" : s >= 4 ? "#22c55e" : s >= 3 ? "#f59e0b" : "#ef4444";
  const ratingColor = /^A/.test(r.rating) ? "#22c55e" : /^B/.test(r.rating) ? "#a3e635" : /^C/.test(r.rating) ? "#f59e0b" : "#ef4444";
  const scores: [string, number | null][] = [
    ["DCF", r.dcfScore],
    ["ROE", r.roeScore],
    ["ROA", r.roaScore],
    ["D/E", r.deScore],
    ["P/E", r.peScore],
    ["P/B", r.pbScore],
  ];
  return (
    <>
      <SectionLabel>FMP Rating</SectionLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontFamily: '"Instrument Serif", serif', color: ratingColor }}>{r.rating}</span>
        {r.overallScore != null && (
          <span style={{ fontSize: 11, color: "#71717a" }}>score {r.overallScore}/5</span>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {scores.map(([label, s]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#71717a" }}>{label}</div>
              <div style={{ fontSize: 11, color: scoreColor(s) }}>{s ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TechnicalsSection({ data }: { data: StockData }) {
  const t = data.technicals;
  if (!t) return null;
  const items: Item[] = [
    ["RSI 14", nOr(t.rsi14, (x) => x.toFixed(1))],
    ["SMA 20", nOr(t.sma20, fmt)],
    ["EMA 50", nOr(t.ema50, fmt)],
  ];
  if (!hasAny(items)) return null;
  return (
    <>
      <SectionLabel>Technicals</SectionLabel>
      <Grid minCol={84} items={items} />
    </>
  );
}

function RatingChangesSection({ data }: { data: StockData }) {
  if (data.grades.length === 0) return null;
  const actionColor = (a: string) =>
    a === "upgrade" ? "#22c55e" : a === "downgrade" ? "#ef4444" : "#71717a";
  return (
    <>
      <SectionLabel>Recent Rating Changes</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.grades.slice(0, 6).map((g, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", fontSize: 11, gap: 8 }}>
            <span style={{ color: "#a1a1aa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {g.company || "—"}
            </span>
            <span style={{ color: actionColor(g.action), textTransform: "capitalize", width: 70, textAlign: "right" }}>
              {g.action}
            </span>
            <span style={{ color: "#71717a", width: 92, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {g.toGrade}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function DividendHistorySection({ data }: { data: StockData }) {
  if (data.dividends.length === 0) return null;
  return (
    <>
      <SectionLabel>Dividend History</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.dividends.slice(0, 6).map((d, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: "#a1a1aa" }}>{d.date}</span>
            <span style={{ color: "#71717a" }}>{d.frequency}</span>
            <span style={{ color: "#a1a1aa" }}>${fmt(d.amount)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function StatementsSection({ data }: { data: StockData }) {
  const s = data.statements;
  if (!s) return null;
  const yr = s.fiscalYear ? ` · FY${s.fiscalYear}` : "";
  return (
    <>
      {s.income && hasAny([["Revenue", nOr(s.income.revenue, fmtCompact)]]) && (
        <>
          <SectionLabel>Income Statement{yr}</SectionLabel>
          <Grid items={[
            ["Revenue", nOr(s.income.revenue, fmtCompact)],
            ["Gross Profit", nOr(s.income.grossProfit, fmtCompact)],
            ["Oper Income", nOr(s.income.operatingIncome, fmtCompact)],
            ["EBITDA", nOr(s.income.ebitda, fmtCompact)],
            ["Net Income", nOr(s.income.netIncome, fmtCompact)],
            ["R&D", nOr(s.income.researchAndDevelopment, fmtCompact)],
            ["EPS (dil)", nOr(s.income.epsDiluted, money)],
            ["Income Tax", nOr(s.income.incomeTax, fmtCompact)],
          ]} />
        </>
      )}
      {s.balance && hasAny([["Assets", nOr(s.balance.totalAssets, fmtCompact)]]) && (
        <>
          <SectionLabel>Balance Sheet{yr}</SectionLabel>
          <Grid items={[
            ["Assets", nOr(s.balance.totalAssets, fmtCompact)],
            ["Liabilities", nOr(s.balance.totalLiabilities, fmtCompact)],
            ["Equity", nOr(s.balance.totalEquity, fmtCompact)],
            ["Cash", nOr(s.balance.cash, fmtCompact)],
            ["Total Debt", nOr(s.balance.totalDebt, fmtCompact)],
            ["Net Debt", nOr(s.balance.netDebt, fmtCompact)],
            ["Inventory", nOr(s.balance.inventory, fmtCompact)],
            ["Ret. Earnings", nOr(s.balance.retainedEarnings, fmtCompact)],
          ]} />
        </>
      )}
      {s.cashflow && hasAny([["Op Cash Flow", nOr(s.cashflow.operatingCashFlow, fmtCompact)]]) && (
        <>
          <SectionLabel>Cash Flow{yr}</SectionLabel>
          <Grid items={[
            ["Op Cash Flow", nOr(s.cashflow.operatingCashFlow, fmtCompact)],
            ["CapEx", nOr(s.cashflow.capex, fmtCompact)],
            ["Free CF", nOr(s.cashflow.freeCashFlow, fmtCompact)],
            ["Buybacks", nOr(s.cashflow.buybacks, fmtCompact)],
            ["Dividends", nOr(s.cashflow.dividendsPaid, fmtCompact)],
            ["SBC", nOr(s.cashflow.stockBasedComp, fmtCompact)],
          ]} />
        </>
      )}
    </>
  );
}

function EstimatesSection({ data }: { data: StockData }) {
  const e = data.estimates;
  if (!e) return null;
  const items: Item[] = [
    ["Revenue", nOr(e.revenueAvg, fmtCompact)],
    ["EBITDA", nOr(e.ebitdaAvg, fmtCompact)],
    ["Net Income", nOr(e.netIncomeAvg, fmtCompact)],
    ["EPS", nOr(e.epsAvg, money)],
    ["EPS Range", e.epsLow != null && e.epsHigh != null ? `$${fmt(e.epsLow)}–$${fmt(e.epsHigh)}` : null],
    ["# Analysts", nOr(e.numAnalysts, (x) => String(x))],
  ];
  if (!hasAny(items)) return null;
  const yr = e.date ? e.date.slice(0, 4) : "";
  return (
    <>
      <SectionLabel>Analyst Estimates{yr ? ` · FY${yr}` : ""}</SectionLabel>
      <Grid items={items} />
    </>
  );
}

export function StockAnalyzer() {
  const [input, setInput] = useState("");
  const { data, loading, error, search, clear } = useStock();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(input);
  };

  const goto = (sym: string) => {
    setInput(sym);
    search(sym);
  };

  const f = data?.fundamentals;

  return (
    <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ display: "flex", borderBottom: data || error ? "1px solid #27272a" : "none" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search ticker..."
          aria-label="Search ticker"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            padding: "10px 14px", color: "#fafafa", fontFamily: '"DM Mono", monospace', fontSize: 12,
          }}
        />
        {data && (
          <button type="button" onClick={clear} aria-label="Clear search" style={{
            background: "transparent", border: "none", color: "#71717a", padding: "0 8px",
            cursor: "pointer", fontFamily: '"DM Mono", monospace', fontSize: 11,
          }}>
            &times;
          </button>
        )}
        <button type="submit" disabled={loading || !input.trim()} style={{
          background: loading ? "#27272a" : "#c8f542", color: loading ? "#71717a" : "#0a0a0b",
          border: "none", padding: "10px 18px", fontFamily: '"DM Mono", monospace', fontSize: 11,
          fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.1em",
          cursor: loading || !input.trim() ? "default" : "pointer",
        }}>
          {loading ? "..." : "Search"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div role="alert" style={{ padding: "16px 14px", color: "#ef4444", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Body */}
      {data && (
        <div style={{ padding: "14px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 22, letterSpacing: -0.5 }}>
                {data.quote.symbol}
              </div>
              <div style={{ fontSize: 10, color: "#71717a", marginTop: 1 }}>
                {data.profile?.companyName ?? data.quote.name} · {data.quote.exchange}
              </div>
              {data.profile && (data.profile.sector || data.profile.industry) && (
                <div style={{ fontSize: 10, color: "#52525b", marginTop: 1 }}>
                  {[data.profile.sector, data.profile.industry].filter(Boolean).join(" · ")}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 18, color: "#fafafa" }}>${fmt(data.quote.price)}</span>
                <span style={{ fontSize: 12, color: data.quote.change >= 0 ? "#22c55e" : "#ef4444" }}>
                  {data.quote.change >= 0 ? "+" : ""}
                  {fmt(data.quote.change)} ({data.quote.changePercentage >= 0 ? "+" : ""}
                  {data.quote.changePercentage.toFixed(2)}%)
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#71717a" }}>Mkt Cap</div>
              <div style={{ fontSize: 13, color: "#a1a1aa" }}>{fmtCompact(data.quote.marketCap)}</div>
              {data.profile?.beta != null && (
                <div style={{ fontSize: 10, color: "#71717a", marginTop: 4 }}>
                  β {data.profile.beta.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* Company blurb */}
          {data.profile && (
            <>
              {data.profile.description && (
                <div style={{
                  fontSize: 11, color: "#a1a1aa", lineHeight: 1.5, marginTop: 12,
                  display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {data.profile.description}
                </div>
              )}
              <Grid
                minCol={80}
                items={[
                  ["CEO", data.profile.ceo || null],
                  ["Employees", data.profile.employees ? fmtCompact(Number(data.profile.employees)) : null],
                  ["Country", data.profile.country || null],
                  ["IPO", data.profile.ipoDate || null],
                ]}
              />
            </>
          )}

          {/* Key metrics */}
          <div style={{ marginTop: 14 }}>
            <Grid
              minCol={72}
              items={[
                ["Open", fmt(data.quote.open)],
                ["Prev Close", fmt(data.quote.previousClose)],
                ["Day Range", `${fmt(data.quote.dayLow)}–${fmt(data.quote.dayHigh)}`],
                ["Volume", fmtCompact(data.quote.volume)],
                ["MA 50", fmt(data.quote.priceAvg50)],
                ["MA 200", fmt(data.quote.priceAvg200)],
                ["Year Low", fmt(data.quote.yearLow)],
                ["Year High", fmt(data.quote.yearHigh)],
              ]}
            />
          </div>

          {/* Price chart */}
          {data.ohlc.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <SectionLabel>Price History · 3M</SectionLabel>
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.ohlc}>
                    <XAxis dataKey="date" hide />
                    <YAxis domain={["auto", "auto"]} hide />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 4, fontSize: 11, color: "#fafafa" }}
                      formatter={(value) => [`$${fmt(Number(value))}`, "Close"]}
                      labelFormatter={(label) => String(label ?? "")}
                    />
                    <Line type="monotone" dataKey="close" stroke="#c8f542" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Technicals */}
          <TechnicalsSection data={data} />

          {/* Analyst consensus + price targets */}
          <AnalystSection data={data} />

          {/* Recent analyst rating changes */}
          <RatingChangesSection data={data} />

          {/* FMP rating */}
          <RatingSection data={data} />

          {/* Valuation */}
          {f && hasAny([
            ["P/E", nOr(f.valuation.pe, mult)],
          ]) && (
            <>
              <SectionLabel>Valuation (TTM)</SectionLabel>
              <Grid items={[
                ["P/E", nOr(f.valuation.pe, mult)],
                ["PEG", nOr(f.valuation.peg, (x) => dec(x, 2))],
                ["P/S", nOr(f.valuation.ps, mult)],
                ["P/B", nOr(f.valuation.pb, mult)],
                ["P/FCF", nOr(f.valuation.pFcf, mult)],
                ["EV/EBITDA", nOr(f.valuation.evEbitda, mult)],
                ["EV/Sales", nOr(f.valuation.evSales, mult)],
                ["Earn. Yld", nOr(f.valuation.earningsYield, (x) => pct(x, 2))],
                ["FCF Yld", nOr(f.valuation.fcfYield, (x) => pct(x, 2))],
              ]} />
            </>
          )}

          {/* Profitability */}
          {f && hasAny([["ROE", nOr(f.profitability.roe, pct)]]) && (
            <>
              <SectionLabel>Profitability (TTM)</SectionLabel>
              <Grid items={[
                ["Gross Mgn", nOr(f.profitability.grossMargin, (x) => pct(x, 1))],
                ["Oper Mgn", nOr(f.profitability.operatingMargin, (x) => pct(x, 1))],
                ["Net Mgn", nOr(f.profitability.netMargin, (x) => pct(x, 1))],
                ["ROE", nOr(f.profitability.roe, (x) => pct(x, 1))],
                ["ROA", nOr(f.profitability.roa, (x) => pct(x, 1))],
                ["ROIC", nOr(f.profitability.roic, (x) => pct(x, 1))],
                ["ROCE", nOr(f.profitability.roce, (x) => pct(x, 1))],
              ]} />
            </>
          )}

          {/* Efficiency */}
          {f && hasAny([["Asset Turn", nOr(f.efficiency.assetTurnover, (x) => dec(x, 2))]]) && (
            <>
              <SectionLabel>Efficiency (TTM)</SectionLabel>
              <Grid items={[
                ["Asset Turn", nOr(f.efficiency.assetTurnover, (x) => dec(x, 2))],
                ["Inv Turn", nOr(f.efficiency.inventoryTurnover, (x) => dec(x, 1))],
                ["Recv Turn", nOr(f.efficiency.receivablesTurnover, (x) => dec(x, 1))],
                ["DSO", nOr(f.efficiency.daysSalesOutstanding, (x) => dec(x, 0))],
                ["DIO", nOr(f.efficiency.daysInventoryOutstanding, (x) => dec(x, 0))],
                ["Cash Cycle", nOr(f.efficiency.cashConversionCycle, (x) => dec(x, 0))],
                ["Graham #", nOr(f.efficiency.grahamNumber, money)],
                ["Tax Rate", nOr(f.efficiency.effectiveTaxRate, (x) => pct(x, 1))],
              ]} />
            </>
          )}

          {/* Financial health */}
          {f && hasAny([["Current", nOr(f.health.currentRatio, dec)]]) && (
            <>
              <SectionLabel>Financial Health (TTM)</SectionLabel>
              <Grid items={[
                ["Current", nOr(f.health.currentRatio, (x) => dec(x, 2))],
                ["Quick", nOr(f.health.quickRatio, (x) => dec(x, 2))],
                ["Cash", nOr(f.health.cashRatio, (x) => dec(x, 2))],
                ["Debt/Eq", nOr(f.health.debtToEquity, (x) => dec(x, 2))],
                ["Int Cov", nOr(f.health.interestCoverage, (x) => dec(x, 1))],
                ["NetDebt/EBITDA", nOr(f.health.netDebtToEbitda, (x) => dec(x, 2))],
              ]} />
            </>
          )}

          {/* Per-share & dividends */}
          {f && hasAny([["EPS", nOr(f.perShare.eps, money)]]) && (
            <>
              <SectionLabel>Per Share & Dividends (TTM)</SectionLabel>
              <Grid items={[
                ["EPS", nOr(f.perShare.eps, money)],
                ["Rev/Sh", nOr(f.perShare.revenuePerShare, money)],
                ["BV/Sh", nOr(f.perShare.bookValuePerShare, money)],
                ["FCF/Sh", nOr(f.perShare.fcfPerShare, money)],
                ["Cash/Sh", nOr(f.perShare.cashPerShare, money)],
                ["Div/Sh", nOr(f.perShare.dividendPerShare, money)],
                ["Div Yield", nOr(f.dividend.yield, (x) => pct(x, 2))],
                ["Payout", nOr(f.dividend.payoutRatio, (x) => pct(x, 0))],
              ]} />
            </>
          )}

          {/* Dividend history */}
          <DividendHistorySection data={data} />

          {/* Financial statements */}
          <StatementsSection data={data} />

          {/* Forward analyst estimates */}
          <EstimatesSection data={data} />

          {/* Next earnings */}
          {data.earnings && (
            <>
              <SectionLabel>Next Earnings</SectionLabel>
              <Grid minCol={100} items={[
                ["Date", data.earnings.date || null],
                ["EPS Est.", nOr(data.earnings.epsEstimated, money)],
                ["Rev Est.", nOr(data.earnings.revenueEstimated, fmtCompact)],
              ]} />
            </>
          )}

          {/* Peers */}
          {data.peers.length > 0 && (
            <>
              <SectionLabel>Peers</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.peers.map((p) => (
                  <button
                    key={p.symbol}
                    type="button"
                    onClick={() => goto(p.symbol)}
                    title={p.companyName}
                    style={{
                      background: "#1e1e22", border: "1px solid #27272a", borderRadius: 3,
                      padding: "3px 8px", fontSize: 10, color: "#c8f542", cursor: "pointer",
                      fontFamily: '"DM Mono", monospace',
                    }}
                  >
                    {p.symbol}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
