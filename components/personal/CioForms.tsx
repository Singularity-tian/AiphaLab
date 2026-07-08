"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PersonalProfile } from "@/lib/personal";

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
  color: "#71717a",
  display: "block",
  fontSize: 10,
  letterSpacing: "0.08em",
  marginBottom: 5,
  textTransform: "uppercase",
};

const primaryButton: CSSProperties = {
  background: "#c8f542",
  border: "none",
  borderRadius: 4,
  color: "#0a0a0b",
  cursor: "pointer",
  fontFamily: '"DM Mono", monospace',
  fontSize: 11,
  letterSpacing: "0.08em",
  padding: "8px 12px",
  textTransform: "uppercase",
};

const ghostButton: CSSProperties = {
  background: "transparent",
  border: "1px solid #27272a",
  borderRadius: 4,
  color: "#a1a1aa",
  cursor: "pointer",
  fontFamily: '"DM Mono", monospace',
  fontSize: 10,
  letterSpacing: "0.08em",
  padding: "6px 8px",
  textTransform: "uppercase",
};

function num(v: FormDataEntryValue | null): number {
  return Number(String(v ?? "0").trim() || 0);
}

function maybeNum(v: FormDataEntryValue | null): number | undefined {
  const text = String(v ?? "").trim();
  return text ? Number(text) : undefined;
}

function text(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function formatError(value: unknown) {
  if (Array.isArray(value)) return value.map((i: any) => i.message ?? String(i)).join("; ");
  return String(value ?? "Request failed");
}

export function FinancialProfileForm({ profile }: { profile: PersonalProfile }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setStatus("saving");
    setError(null);
    const body = {
      baseCurrency: text(fd.get("baseCurrency")) || "USD",
      monthlyIncome: num(fd.get("monthlyIncome")),
      monthlyExpenses: num(fd.get("monthlyExpenses")),
      emergencyMonthsTarget: num(fd.get("emergencyMonthsTarget")) || 6,
      riskTolerance: text(fd.get("riskTolerance")) || "moderate",
      maxDrawdownPct: num(fd.get("maxDrawdownPct")) || 15,
      maxSinglePositionPct: num(fd.get("maxSinglePositionPct")) || 20,
      maxSectorPct: num(fd.get("maxSectorPct")) || 35,
      goals: text(fd.get("goals")).split("\n").map((s) => s.trim()).filter(Boolean),
      notes: text(fd.get("notes")),
    };
    const res = await fetch("/api/personal/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(formatError(json.error));
      setStatus("failed");
      return;
    }
    setStatus("idle");
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={panelStyle}>
      <PanelHeader title="Financial Profile" meta={`Risk: ${profile.risk_tolerance}`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Field label="Currency"><input name="baseCurrency" defaultValue={profile.base_currency} style={inputStyle} /></Field>
        <Field label="Income"><input name="monthlyIncome" type="number" min="0" step="1" defaultValue={profile.monthly_income} style={inputStyle} /></Field>
        <Field label="Outflows"><input name="monthlyExpenses" type="number" min="0" step="1" defaultValue={profile.monthly_expenses} style={inputStyle} /></Field>
        <Field label="Cash Months"><input name="emergencyMonthsTarget" type="number" min="1" max="36" step="0.5" defaultValue={profile.emergency_months_target} style={inputStyle} /></Field>
        <Field label="Risk">
          <select name="riskTolerance" defaultValue={profile.risk_tolerance} style={inputStyle}>
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </Field>
        <Field label="Max DD %"><input name="maxDrawdownPct" type="number" min="0" max="100" step="1" defaultValue={profile.max_drawdown_pct} style={inputStyle} /></Field>
        <Field label="Max Pos %"><input name="maxSinglePositionPct" type="number" min="0" max="100" step="1" defaultValue={profile.max_single_position_pct} style={inputStyle} /></Field>
        <Field label="Max Sector %"><input name="maxSectorPct" type="number" min="0" max="100" step="1" defaultValue={profile.max_sector_pct} style={inputStyle} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Goals"><textarea name="goals" rows={4} defaultValue={profile.goals_json.join("\n")} style={inputStyle} /></Field>
        <Field label="Notes"><textarea name="notes" rows={4} defaultValue={profile.notes} style={inputStyle} /></Field>
      </div>
      <FormFooter status={status} error={error} idleLabel="Save Profile" savingLabel="Saving" />
    </form>
  );
}

export function HoldingForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setStatus("saving");
    setError(null);
    const body = {
      account: text(fd.get("account")) || "Taxable",
      assetClass: text(fd.get("assetClass")) || "equity",
      symbol: text(fd.get("symbol")),
      name: text(fd.get("name")),
      sector: text(fd.get("sector")) || "Unclassified",
      quantity: num(fd.get("quantity")),
      costBasis: maybeNum(fd.get("costBasis")),
      marketPrice: num(fd.get("marketPrice")),
      currency: text(fd.get("currency")) || "USD",
      liquidity: text(fd.get("liquidity")) || "daily",
      notes: text(fd.get("notes")),
    };
    const res = await fetch("/api/personal/holdings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(formatError(json.error));
      setStatus("failed");
      return;
    }
    form.reset();
    setStatus("idle");
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={panelStyle}>
      <PanelHeader title="Add Holding" meta="Manual source of truth" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Field label="Account"><input name="account" defaultValue="Taxable" style={inputStyle} /></Field>
        <Field label="Asset">
          <select name="assetClass" defaultValue="equity" style={inputStyle}>
            <option value="cash">Cash</option>
            <option value="equity">Equity</option>
            <option value="etf">ETF</option>
            <option value="option">Option</option>
            <option value="crypto">Crypto</option>
            <option value="fund">Fund</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Symbol"><input name="symbol" required placeholder="CASH" style={inputStyle} /></Field>
        <Field label="Sector"><input name="sector" placeholder="Cash / Tech" style={inputStyle} /></Field>
        <Field label="Quantity"><input name="quantity" required type="number" min="0" step="0.0001" style={inputStyle} /></Field>
        <Field label="Cost"><input name="costBasis" type="number" min="0" step="0.01" style={inputStyle} /></Field>
        <Field label="Price"><input name="marketPrice" required type="number" min="0" step="0.01" defaultValue="1" style={inputStyle} /></Field>
        <Field label="Currency"><input name="currency" defaultValue="USD" style={inputStyle} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Name"><input name="name" style={inputStyle} /></Field>
        <Field label="Liquidity">
          <select name="liquidity" defaultValue="daily" style={inputStyle}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="locked">Locked</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="Notes"><textarea name="notes" rows={3} style={inputStyle} /></Field>
      </div>
      <FormFooter status={status} error={error} idleLabel="Add Holding" savingLabel="Adding" />
    </form>
  );
}

export function BudgetItemForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setStatus("saving");
    setError(null);
    const body = {
      itemType: text(fd.get("itemType")),
      category: text(fd.get("category")) || "General",
      label: text(fd.get("label")),
      monthlyAmount: num(fd.get("monthlyAmount")),
      priority: num(fd.get("priority")) || 3,
      notes: text(fd.get("notes")),
    };
    const res = await fetch("/api/personal/budget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(formatError(json.error));
      setStatus("failed");
      return;
    }
    form.reset();
    setStatus("idle");
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={panelStyle}>
      <PanelHeader title="Budget Item" meta="Monthly run-rate" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Field label="Type">
          <select name="itemType" defaultValue="expense" style={inputStyle}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="debt_payment">Debt</option>
            <option value="savings_goal">Savings</option>
          </select>
        </Field>
        <Field label="Category"><input name="category" defaultValue="General" style={inputStyle} /></Field>
        <Field label="Label"><input name="label" required placeholder="Rent" style={inputStyle} /></Field>
        <Field label="Amount"><input name="monthlyAmount" required type="number" min="0" step="1" style={inputStyle} /></Field>
        <Field label="Priority"><input name="priority" type="number" min="1" max="5" defaultValue="3" style={inputStyle} /></Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Notes"><textarea name="notes" rows={3} style={inputStyle} /></Field>
      </div>
      <FormFooter status={status} error={error} idleLabel="Add Item" savingLabel="Adding" />
    </form>
  );
}

export function AskCioPanel({ contextScore }: { contextScore: number }) {
  const [question, setQuestion] = useState("Can I afford to add risk here, or should I improve my cash buffer first?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "asking" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("asking");
    setAnswer(null);
    setError(null);
    const res = await fetch("/api/cio/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(formatError(json.error));
      setStatus("failed");
      return;
    }
    setAnswer(json.answer);
    setStatus("idle");
  }

  return (
    <section style={panelStyle}>
      <PanelHeader title="Ask My CIO" meta={`Context ${contextScore}%`} />
      <form onSubmit={ask}>
        <Field label="Question">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} style={inputStyle} />
        </Field>
        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={status === "asking"} style={{ ...primaryButton, cursor: status === "asking" ? "default" : "pointer" }}>
            {status === "asking" ? "Thinking" : "Ask"}
          </button>
          {error && <span role="alert" style={{ color: "#ef4444", fontSize: 11, marginLeft: 10 }}>{error}</span>}
        </div>
      </form>
      {answer && (
        <div style={{ borderTop: "1px solid #27272a", color: "#d4d4d8", fontSize: 12, lineHeight: 1.7, marginTop: 14, paddingTop: 14, whiteSpace: "pre-wrap" }}>
          {answer}
        </div>
      )}
    </section>
  );
}

export function DeleteHoldingButton({ id }: { id: number }) {
  return <DeleteButton endpoint={`/api/personal/holdings/${id}`} label="Remove" />;
}

export function DeleteBudgetButton({ id }: { id: number }) {
  return <DeleteButton endpoint={`/api/personal/budget/${id}`} label="Remove" />;
}

function DeleteButton({ endpoint, label }: { endpoint: string; label: string }) {
  return (
    <form action={endpoint} method="post">
      <button
        type="submit"
        data-endpoint={endpoint}
        data-testid="personal-delete-button"
        style={ghostButton}
      >
        {label}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ alignItems: "baseline", display: "flex", gap: 10, justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ color: "#fafafa", fontFamily: '"Instrument Serif", serif', fontSize: 20 }}>{title}</div>
      <div style={{ color: "#71717a", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{meta}</div>
    </div>
  );
}

function FormFooter({ status, error, idleLabel, savingLabel }: { status: string; error: string | null; idleLabel: string; savingLabel: string }) {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 12, marginTop: 14 }}>
      <button type="submit" disabled={status === "saving"} style={{ ...primaryButton, cursor: status === "saving" ? "default" : "pointer" }}>
        {status === "saving" ? savingLabel : idleLabel}
      </button>
      {error && <span role="alert" style={{ color: "#ef4444", fontSize: 11 }}>{error}</span>}
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "#111113",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: 16,
};
