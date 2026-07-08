import Link from "next/link";
import type { CSSProperties } from "react";
import { SimDB, type DeskDashboard, type ResearchReportListItem } from "@/lib/db/repository";
import type { PersonalDashboard } from "@/lib/personal";
import {
  AskCioPanel,
  BudgetItemForm,
  DeleteBudgetButton,
  DeleteHoldingButton,
  FinancialProfileForm,
  HoldingForm,
} from "@/components/personal/CioForms";
import { defaultProfile, buildPersonalDashboard } from "@/lib/personal";

export const dynamic = "force-dynamic";

const emptyDesk: DeskDashboard = {
  proposals: [],
  theses: [],
  recentDecisions: [],
  risk: {
    pendingCount: 0,
    activeTheses: 0,
    pendingRiskBps: 0,
    approvedRiskBps: 0,
    maxSingleRiskBps: 0,
  },
};

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

function statusColor(status: string) {
  if (status === "approved" || status === "filled") return "#22c55e";
  if (status === "rejected" || status === "blocked") return "#ef4444";
  if (status === "deferred") return "#f59e0b";
  return "#c8f542";
}

function alertColor(severity: string) {
  if (severity === "danger") return "#ef4444";
  if (severity === "warning") return "#f59e0b";
  return "#a1a1aa";
}

function metric(label: string, value: string, meta?: string, tone = "#fafafa") {
  return (
    <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 14, minHeight: 92 }}>
      <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: tone, fontFamily: '"Instrument Serif", serif', fontSize: 30, marginTop: 4 }}>{value}</div>
      {meta && <div style={{ color: "#71717a", fontSize: 11, marginTop: 4 }}>{meta}</div>}
    </div>
  );
}

function sectionTitle(text: string, meta?: string) {
  return (
    <div style={{ alignItems: "baseline", borderBottom: "1px solid #27272a", display: "flex", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10 }}>
      <div style={{ color: "#fafafa", fontFamily: '"Instrument Serif", serif', fontSize: 22 }}>{text}</div>
      {meta && <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{meta}</div>}
    </div>
  );
}

export default async function PersonalCioPage() {
  const db = new SimDB();
  let personal: PersonalDashboard = buildPersonalDashboard(defaultProfile, [], []);
  let desk = emptyDesk;
  let reports: ResearchReportListItem[] = [];
  let setupError: string | null = null;

  try {
    [personal, desk, reports] = await Promise.all([
      db.getPersonalDashboard(),
      db.getDeskDashboard(),
      db.listResearchReports(undefined, 6),
    ]);
  } catch (e) {
    setupError = e instanceof Error ? e.message : String(e);
  }

  const c = personal.profile.base_currency;
  const cashTone = personal.metrics.cashCoverageMonths != null && personal.metrics.cashCoverageMonths < personal.profile.emergency_months_target ? "#f59e0b" : "#22c55e";
  const surplusTone = personal.metrics.monthlySurplus < 0 ? "#ef4444" : "#22c55e";

  return (
    <div>
      <header style={{ borderBottom: "1px solid #27272a", marginBottom: 24, paddingBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between" }}>
          <div>
            <h1 style={{ color: "#fafafa", fontFamily: '"Instrument Serif", serif', fontSize: 44, fontWeight: 400, letterSpacing: -1 }}>
              Personal <span style={{ color: "#c8f542", fontStyle: "italic" }}>CIO</span>
            </h1>
            <p style={{ color: "#a1a1aa", maxWidth: 760, marginTop: 6 }}>
              Your investment decisions now start from personal balance sheet, cash flow, current holdings, and risk constraints.
            </p>
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
            <Link href="/research" style={navButton}>Research</Link>
          </div>
        </div>
        {setupError && (
          <div style={{ color: "#f59e0b", fontSize: 12, marginTop: 14 }}>
            Personal CIO tables are not ready: {setupError}. Run <code style={{ color: "#c8f542" }}>pnpm migrate</code>.
          </div>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginBottom: 24 }}>
        {metric("Net Worth", money(personal.metrics.netWorth, c), `${personal.metrics.contextScore}% context`)}
        {metric("Cash Reserve", money(personal.metrics.cashValue, c), personal.metrics.cashCoverageMonths == null ? "months unknown" : `${personal.metrics.cashCoverageMonths.toFixed(1)} months`, cashTone)}
        {metric("Monthly Surplus", money(personal.metrics.monthlySurplus, c), `${money(personal.metrics.monthlyIncome, c)} in / ${money(personal.metrics.monthlyOutflows, c)} out`, surplusTone)}
        {metric("Investable Cash", money(personal.metrics.investableCash, c), `${money(personal.metrics.requiredCashReserve, c)} reserve target`, personal.metrics.investableCash > 0 ? "#c8f542" : "#71717a")}
        {metric("Idea Risk", money(personal.metrics.maxIdeaRiskDollars, c), `${personal.metrics.maxIdeaRiskBps} bps cap`)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(420px, 0.9fr)", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section>
            {sectionTitle("Risk Console", `${personal.alerts.length} signal${personal.alerts.length === 1 ? "" : "s"}`)}
            <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
              {personal.alerts.map((a, idx) => (
                <div key={`${a.message}-${idx}`} style={{ borderBottom: idx === personal.alerts.length - 1 ? "none" : "1px solid #1c1c1f", color: alertColor(a.severity), fontSize: 12, padding: "11px 14px" }}>
                  {a.message}
                </div>
              ))}
              {personal.missingContext.length > 0 && (
                <div style={{ borderTop: "1px solid #27272a", color: "#71717a", fontSize: 11, padding: "11px 14px" }}>
                  Missing: {personal.missingContext.join(", ")}
                </div>
              )}
            </div>
          </section>

          <section>
            {sectionTitle("Holdings", `${personal.holdings.length} line${personal.holdings.length === 1 ? "" : "s"}`)}
            <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Symbol", "Asset", "Sector", "Value", "Alloc", "P&L", ""].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {personal.holdings.map((h) => (
                    <tr key={h.id}>
                      <td style={td}><span style={{ color: "#fafafa" }}>{h.symbol}</span><div style={subText}>{h.account}</div></td>
                      <td style={td}>{h.asset_class}</td>
                      <td style={td}>{h.sector}</td>
                      <td style={td}>{money(h.market_value, h.currency)}</td>
                      <td style={td}>{pct(h.allocation_pct)}</td>
                      <td style={{ ...td, color: h.unrealized_pnl == null ? "#71717a" : h.unrealized_pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                        {h.unrealized_pnl == null ? "-" : money(h.unrealized_pnl, h.currency)}
                      </td>
                      <td style={td}><DeleteHoldingButton id={h.id} /></td>
                    </tr>
                  ))}
                  {personal.holdings.length === 0 && (
                    <tr><td colSpan={7} style={{ ...td, color: "#71717a", padding: 24, textAlign: "center" }}>No holdings yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            {sectionTitle("Sector Exposure", `${pct(personal.metrics.largestSectorPct)} max`)}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {personal.sectors.map((s) => (
                <div key={s.sector} style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <span style={{ color: "#fafafa" }}>{s.sector}</span>
                    <span style={{ color: "#a1a1aa" }}>{money(s.market_value, c)} / {pct(s.allocation_pct)}</span>
                  </div>
                  <div style={{ background: "#27272a", borderRadius: 999, height: 5, overflow: "hidden" }}>
                    <div style={{ background: s.allocation_pct > personal.profile.max_sector_pct ? "#f59e0b" : "#c8f542", height: "100%", width: `${Math.min(100, s.allocation_pct)}%` }} />
                  </div>
                </div>
              ))}
              {personal.sectors.length === 0 && (
                <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, color: "#71717a", padding: 18 }}>
                  No sector exposure yet.
                </div>
              )}
            </div>
          </section>

          <section>
            {sectionTitle("Decision Queue", `${desk.risk.pendingCount} pending`)}
            <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Ticker", "Status", "Risk", "Fit Check"].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {desk.proposals.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td style={td}><Link href={`/proposals/${p.id}`} style={{ color: "#fafafa", textDecoration: "none" }}>{p.ticker}</Link><div style={subText}>{p.instrument_type} / {p.direction}</div></td>
                      <td style={{ ...td, color: statusColor(p.status), textTransform: "uppercase", fontSize: 10 }}>{p.status}</td>
                      <td style={td}>{p.nav_risk_bps == null ? "-" : `${p.nav_risk_bps.toFixed(1)} bps`}</td>
                      <td style={td}>{personal.metrics.contextScore < 70 ? "Needs more personal context" : p.max_loss > personal.metrics.maxIdeaRiskDollars ? "Above personal risk budget" : "Inside current guardrails"}</td>
                    </tr>
                  ))}
                  {desk.proposals.length === 0 && (
                    <tr><td colSpan={4} style={{ ...td, color: "#71717a", padding: 24, textAlign: "center" }}>No investment decisions staged.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            {sectionTitle("Research Inbox")}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reports.map((r) => (
                <Link key={r.id} href={`/research/${r.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ alignItems: "baseline", background: "#111113", border: "1px solid #27272a", borderRadius: 8, display: "flex", gap: 12, padding: "12px 14px" }}>
                    <span style={{ color: "#fafafa", fontFamily: '"Instrument Serif", serif', fontSize: 18, minWidth: 64 }}>{r.ticker}</span>
                    <span style={{ color: statusColor(r.status), fontSize: 10, minWidth: 70, textTransform: "uppercase" }}>{r.status}</span>
                    <span style={{ color: "#a1a1aa", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.report_head ?? ""}</span>
                  </div>
                </Link>
              ))}
              {reports.length === 0 && (
                <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, color: "#71717a", padding: 18 }}>
                  No research reports yet.
                </div>
              )}
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <AskCioPanel contextScore={personal.metrics.contextScore} />
          <FinancialProfileForm profile={personal.profile} />
          <HoldingForm />
          <BudgetItemForm />

          <section>
            {sectionTitle("Budget Run-Rate", `${personal.budgetItems.length} item${personal.budgetItems.length === 1 ? "" : "s"}`)}
            <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, overflow: "hidden" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Type", "Label", "Amount", ""].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {personal.budgetItems.map((b) => (
                    <tr key={b.id}>
                      <td style={td}>{b.item_type}<div style={subText}>{b.category}</div></td>
                      <td style={td}>{b.label}</td>
                      <td style={td}>{money(b.monthly_amount, c)}</td>
                      <td style={td}><DeleteBudgetButton id={b.id} /></td>
                    </tr>
                  ))}
                  {personal.budgetItems.length === 0 && (
                    <tr><td colSpan={4} style={{ ...td, color: "#71717a", padding: 24, textAlign: "center" }}>No budget items yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const navButton: CSSProperties = {
  background: "#111113",
  border: "1px solid #27272a",
  borderRadius: 4,
  color: "#c8f542",
  fontSize: 11,
  letterSpacing: "0.08em",
  padding: "7px 12px",
  textDecoration: "none",
  textTransform: "uppercase",
};

const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
};

const th: CSSProperties = {
  borderBottom: "1px solid #27272a",
  color: "#71717a",
  fontSize: 10,
  letterSpacing: "0.08em",
  padding: "10px 12px",
  textAlign: "left",
  textTransform: "uppercase",
};

const td: CSSProperties = {
  borderBottom: "1px solid #1c1c1f",
  color: "#a1a1aa",
  fontSize: 12,
  padding: "10px 12px",
  verticalAlign: "top",
};

const subText: CSSProperties = {
  color: "#71717a",
  fontSize: 10,
  marginTop: 2,
};
