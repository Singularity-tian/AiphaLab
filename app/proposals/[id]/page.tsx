import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { SimDB } from "@/lib/db/repository";
import { ProposalActions } from "@/components/desk/ProposalActions";

export const dynamic = "force-dynamic";

function statusColor(status: string) {
  if (status === "approved" || status === "filled") return "#22c55e";
  if (status === "rejected" || status === "blocked") return "#ef4444";
  if (status === "deferred") return "#f59e0b";
  return "#c8f542";
}

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId) || proposalId <= 0) notFound();

  const db = new SimDB();
  const detail = await db.getDeskProposal(proposalId);
  if (!detail) notFound();
  const personal = await db.getPersonalDashboard().catch(() => null);

  const { proposal, thesis, riskReview, decisions, fills, postmortem } = detail;
  const ticket = proposal.order_ticket_json;
  const currency = personal?.profile.base_currency ?? "USD";
  const insidePersonalRisk = personal ? proposal.max_loss <= personal.metrics.maxIdeaRiskDollars : false;

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: "#71717a", fontSize: 11, textDecoration: "none" }}>Back to CIO</Link>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginTop: 12 }}>
          <div>
            <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 42, fontWeight: 400 }}>
              {proposal.ticker} <span style={{ color: "#c8f542", fontStyle: "italic" }}>{proposal.instrument_type}</span>
            </h1>
            <div style={{ color: "#a1a1aa", marginTop: 4 }}>{proposal.direction} / {proposal.horizon}</div>
          </div>
          <div style={{ color: statusColor(proposal.status), border: `1px solid ${statusColor(proposal.status)}`, borderRadius: 4, padding: "6px 10px", textTransform: "uppercase", fontSize: 11 }}>
            {proposal.status}
          </div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={panel}>
            <Title>Investment Memo</Title>
            <Block label="Thesis">{thesis?.thesis ?? proposal.rationale}</Block>
            <Block label="Catalyst">{thesis?.catalyst ?? "-"}</Block>
            <Block label="Invalidation">{proposal.invalidation}</Block>
            <Block label="Rationale">{proposal.rationale}</Block>
          </section>

          <section style={panel}>
            <Title>Risk Review</Title>
            {riskReview ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <Metric label="NAV Risk" value={`${riskReview.nav_risk_bps.toFixed(1)} bps`} color="#f59e0b" />
                <Metric label="Gross Delta" value={`${riskReview.gross_exposure_delta_pct.toFixed(1)}%`} />
                <Metric label="Net Delta" value={`${riskReview.net_exposure_delta_pct.toFixed(1)}%`} />
                <Metric label="Scenario Loss" value={`$${riskReview.scenario_loss.toLocaleString()}`} />
                <div style={{ gridColumn: "1 / -1", color: "#a1a1aa", fontSize: 12, marginTop: 8 }}>{riskReview.notes}</div>
                <div style={{ gridColumn: "1 / -1", color: "#71717a", fontSize: 11 }}>{riskReview.sector_exposure_note}</div>
                <div style={{ gridColumn: "1 / -1", color: "#71717a", fontSize: 11 }}>{riskReview.correlation_note}</div>
              </div>
            ) : (
              <div style={{ color: "#ef4444" }}>Missing risk review.</div>
            )}
          </section>

          <section style={panel}>
            <Title>Manual Order Ticket</Title>
            <pre style={{ background: "#0a0a0b", border: "1px solid #27272a", borderRadius: 6, padding: 12, overflowX: "auto", color: "#a1a1aa", fontSize: 11 }}>
              {JSON.stringify(ticket, null, 2)}
            </pre>
          </section>

          {proposal.instrument_type === "option" && (
            <section style={panel}>
              <Title>Options Structure</Title>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <Metric label="Strategy" value={proposal.option_strategy ?? "-"} />
                <Metric label="Expiry" value={proposal.option_expiry ?? "-"} />
                <Metric label="Premium" value={proposal.option_premium == null ? "-" : `$${proposal.option_premium.toFixed(2)}`} />
                <Metric label="Breakeven" value={proposal.option_breakeven == null ? "-" : `$${proposal.option_breakeven.toFixed(2)}`} />
                <div style={{ gridColumn: "1 / -1", color: "#a1a1aa", fontSize: 12 }}>Strikes: {(proposal.option_strikes_json ?? []).join(", ")}</div>
                <div style={{ gridColumn: "1 / -1", color: "#71717a", fontSize: 11 }}>IV: {proposal.implied_vol_note}</div>
                <div style={{ gridColumn: "1 / -1", color: "#71717a", fontSize: 11 }}>Liquidity: {proposal.liquidity_note}</div>
              </div>
            </section>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={panel}>
            <Title>Personal Fit</Title>
            {personal ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Metric label="Net Worth" value={money(personal.metrics.netWorth, currency)} />
                <Metric label="Cash Months" value={personal.metrics.cashCoverageMonths == null ? "-" : personal.metrics.cashCoverageMonths.toFixed(1)} color={personal.metrics.cashCoverageMonths != null && personal.metrics.cashCoverageMonths < personal.profile.emergency_months_target ? "#f59e0b" : "#22c55e"} />
                <Metric label="Idea Cap" value={money(personal.metrics.maxIdeaRiskDollars, currency)} />
                <Metric label="This Risk" value={money(proposal.max_loss, currency)} color={insidePersonalRisk ? "#22c55e" : "#ef4444"} />
                <div style={{ gridColumn: "1 / -1", color: insidePersonalRisk ? "#22c55e" : "#f59e0b", fontSize: 12, marginTop: 4 }}>
                  {insidePersonalRisk ? "Inside current personal risk budget." : "Above current personal risk budget or context is incomplete."}
                </div>
              </div>
            ) : (
              <div style={{ color: "#71717a", fontSize: 12 }}>Personal context unavailable.</div>
            )}
          </section>

          <ProposalActions proposalId={proposal.id} status={proposal.status} symbol={proposal.ticker} />

          <section style={panel}>
            <Title>Decision Log</Title>
            <ListEmpty show={decisions.length === 0}>No decisions yet.</ListEmpty>
            {decisions.map((d) => (
              <div key={d.id} style={row}>
                <div style={{ color: statusColor(d.decision), textTransform: "uppercase", fontSize: 10 }}>{d.decision}</div>
                <div style={{ color: "#a1a1aa", fontSize: 11 }}>{d.reason}</div>
                <div style={{ color: "#71717a", fontSize: 10 }}>{d.decided_at.slice(0, 16).replace("T", " ")}</div>
              </div>
            ))}
          </section>

          <section style={panel}>
            <Title>Fills</Title>
            <ListEmpty show={fills.length === 0}>No manual fills.</ListEmpty>
            {fills.map((f) => (
              <div key={f.id} style={row}>
                <div style={{ color: "#fafafa" }}>{f.side} {f.quantity} {f.symbol}</div>
                <div style={{ color: "#a1a1aa", fontSize: 11 }}>${f.price.toFixed(2)} / fees ${f.fees.toFixed(2)}</div>
                <div style={{ color: "#71717a", fontSize: 10 }}>{f.broker} / {f.filled_at.slice(0, 10)}</div>
              </div>
            ))}
          </section>

          <section style={panel}>
            <Title>Postmortem</Title>
            {postmortem ? (
              <div style={{ color: "#a1a1aa", fontSize: 12 }}>
                <div style={{ color: "#fafafa" }}>{postmortem.thesis_outcome}</div>
                <div>Score: {postmortem.process_score}/10</div>
                <div>P/L: {postmortem.pnl == null ? "-" : `$${postmortem.pnl.toFixed(2)}`}</div>
                <div>{postmortem.mistake_taxonomy}</div>
                <div style={{ marginTop: 8 }}>{postmortem.notes}</div>
              </div>
            ) : (
              <div style={{ color: "#71717a", fontSize: 12 }}>No postmortem yet.</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 22, marginBottom: 12 }}>{children}</div>;
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: "#71717a", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#a1a1aa", fontSize: 12, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

function Metric({ label, value, color = "#a1a1aa" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#0a0a0b", border: "1px solid #27272a", borderRadius: 6, padding: 10 }}>
      <div style={{ color: "#71717a", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 14, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ListEmpty({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <div style={{ color: "#71717a", fontSize: 12 }}>{children}</div> : null;
}

const panel: CSSProperties = {
  background: "#111113",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: 16,
};

const row: CSSProperties = {
  borderTop: "1px solid #27272a",
  paddingTop: 10,
  marginTop: 10,
};
