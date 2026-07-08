"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#0a0a0b",
  border: "1px solid #27272a",
  borderRadius: 4,
  color: "#fafafa",
  padding: "8px 10px",
  fontFamily: '"DM Mono", monospace',
  fontSize: 12,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 5,
  display: "block",
};

function num(v: FormDataEntryValue | null): number | undefined {
  if (v == null || String(v).trim() === "") return undefined;
  return Number(v);
}

function text(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

export function NewTradeProposalForm() {
  const [instrumentType, setInstrumentType] = useState<"equity" | "option">("equity");
  const [phase, setPhase] = useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPhase("saving");
    setError(null);

    const body: Record<string, unknown> = {
      ticker: text(fd.get("ticker")),
      direction: text(fd.get("direction")) || "long",
      instrumentType,
      horizon: text(fd.get("horizon")),
      catalyst: text(fd.get("catalyst")),
      thesis: text(fd.get("thesis")),
      invalidation: text(fd.get("invalidation")),
      confidence: num(fd.get("confidence")) ?? 0.6,
      sources: text(fd.get("sources")).split("\n").map((s) => s.trim()).filter(Boolean),
      entryPrice: num(fd.get("entryPrice")),
      targetPrice: num(fd.get("targetPrice")),
      stopPrice: num(fd.get("stopPrice")),
      quantity: num(fd.get("quantity")),
      maxLoss: num(fd.get("maxLoss")),
      accountNav: num(fd.get("accountNav")) ?? 100000,
      rationale: text(fd.get("rationale")),
    };

    if (instrumentType === "option") {
      body.option = {
        strategy: text(fd.get("strategy")),
        expiry: text(fd.get("expiry")),
        strikes: text(fd.get("strikes")).split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)),
        premium: num(fd.get("premium")),
        maxGain: num(fd.get("maxGain")),
        breakeven: num(fd.get("breakeven")),
        impliedVolNote: text(fd.get("impliedVolNote")),
        liquidityNote: text(fd.get("liquidityNote")),
      };
    }

    try {
      const res = await fetch("/api/desk/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(Array.isArray(json.error) ? json.error.map((i: any) => i.message).join("; ") : json.error ?? "Failed to save");
        setPhase("failed");
        return;
      }
      router.push(`/proposals/${json.proposal.id}`);
      router.refresh();
    } catch {
      setError("Network error");
      setPhase("failed");
    }
  }

  return (
    <form onSubmit={submit} style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: '"Instrument Serif", serif', fontSize: 20 }}>New Proposal</div>
          <div style={{ color: "#71717a", fontSize: 11 }}>Draft-only, manual execution ledger</div>
        </div>
        <select
          value={instrumentType}
          onChange={(e) => setInstrumentType(e.target.value as "equity" | "option")}
          style={{ ...inputStyle, width: 126 }}
          name="instrumentType"
        >
          <option value="equity">Equity</option>
          <option value="option">Option</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Field label="Ticker"><input name="ticker" required placeholder="META" style={inputStyle} /></Field>
        <Field label="Direction">
          <select name="direction" defaultValue="long" style={inputStyle}>
            <option value="long">Long</option>
            <option value="short">Short</option>
            <option value="hedge">Hedge</option>
          </select>
        </Field>
        <Field label="Horizon"><input name="horizon" required placeholder="2-8 weeks" style={inputStyle} /></Field>
        <Field label="NAV"><input name="accountNav" type="number" min="1" defaultValue="100000" style={inputStyle} /></Field>
        <Field label="Entry"><input name="entryPrice" type="number" step="0.01" min="0" required style={inputStyle} /></Field>
        <Field label="Quantity"><input name="quantity" type="number" step="0.0001" min="0" required style={inputStyle} /></Field>
        <Field label="Max Loss"><input name="maxLoss" type="number" step="0.01" min="0" required style={inputStyle} /></Field>
        <Field label="Confidence"><input name="confidence" type="number" step="0.01" min="0" max="1" defaultValue="0.6" style={inputStyle} /></Field>
        <Field label="Target"><input name="targetPrice" type="number" step="0.01" min="0" style={inputStyle} /></Field>
        <Field label="Stop"><input name="stopPrice" type="number" step="0.01" min="0" style={inputStyle} /></Field>
      </div>

      {instrumentType === "option" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
          <Field label="Strategy">
            <select name="strategy" defaultValue="debit_spread" style={inputStyle}>
              <option value="long_call">Long Call</option>
              <option value="long_put">Long Put</option>
              <option value="debit_spread">Debit Spread</option>
              <option value="collar">Collar</option>
              <option value="covered_call">Covered Call</option>
              <option value="protective_put">Protective Put</option>
            </select>
          </Field>
          <Field label="Expiry"><input name="expiry" type="date" required={instrumentType === "option"} style={inputStyle} /></Field>
          <Field label="Strikes"><input name="strikes" placeholder="520, 550" required={instrumentType === "option"} style={inputStyle} /></Field>
          <Field label="Premium"><input name="premium" type="number" step="0.01" min="0" required={instrumentType === "option"} style={inputStyle} /></Field>
          <Field label="Max Gain"><input name="maxGain" type="number" step="0.01" min="0" style={inputStyle} /></Field>
          <Field label="Breakeven"><input name="breakeven" type="number" step="0.01" min="0" required={instrumentType === "option"} style={inputStyle} /></Field>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Catalyst"><textarea name="catalyst" required rows={3} style={inputStyle} /></Field>
        <Field label="Invalidation"><textarea name="invalidation" required rows={3} style={inputStyle} /></Field>
        <Field label="Thesis"><textarea name="thesis" required rows={5} style={inputStyle} /></Field>
        <Field label="Rationale"><textarea name="rationale" required rows={5} style={inputStyle} /></Field>
        {instrumentType === "option" && (
          <>
            <Field label="IV Note"><textarea name="impliedVolNote" required rows={3} style={inputStyle} /></Field>
            <Field label="Liquidity Note"><textarea name="liquidityNote" required rows={3} style={inputStyle} /></Field>
          </>
        )}
        <Field label="Sources"><textarea name="sources" rows={3} placeholder="One source per line" style={inputStyle} /></Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button
          type="submit"
          disabled={phase === "saving"}
          style={{
            background: "#c8f542",
            color: "#0a0a0b",
            border: "none",
            borderRadius: 4,
            padding: "8px 14px",
            fontFamily: '"DM Mono", monospace',
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: phase === "saving" ? "default" : "pointer",
          }}
        >
          {phase === "saving" ? "Saving" : "Stage Proposal"}
        </button>
        {error && <span role="alert" style={{ color: "#ef4444", fontSize: 11 }}>{error}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}
