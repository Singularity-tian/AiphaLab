"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import type { ProposalStatus } from "@/lib/desk";

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

const buttonStyle: CSSProperties = {
  border: "none",
  borderRadius: 4,
  padding: "8px 12px",
  fontFamily: '"DM Mono", monospace',
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  cursor: "pointer",
};

export function ProposalActions({ proposalId, status, symbol }: { proposalId: number; status: ProposalStatus; symbol: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const decisionDisabled = busy || status === "rejected" || status === "filled" || status === "closed";

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(formatError(json.error));
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function submitFill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await post(`/api/desk/proposals/${proposalId}/fills`, {
      broker: String(fd.get("broker") ?? ""),
      symbol: String(fd.get("symbol") ?? ""),
      side: String(fd.get("side") ?? "BUY"),
      quantity: Number(fd.get("quantity")),
      price: Number(fd.get("price")),
      fees: Number(fd.get("fees") || 0),
      filledAt: new Date().toISOString(),
      notes: String(fd.get("notes") ?? ""),
    });
  }

  async function submitPostmortem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await post(`/api/desk/proposals/${proposalId}/postmortem`, {
      thesisOutcome: String(fd.get("thesisOutcome") ?? ""),
      processScore: Number(fd.get("processScore")),
      pnl: fd.get("pnl") ? Number(fd.get("pnl")) : undefined,
      mistakeTaxonomy: String(fd.get("mistakeTaxonomy") ?? ""),
      notes: String(fd.get("notes") ?? ""),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={panel}>
        <div style={title}>PM Decision</div>
        <form action={`/api/desk/proposals/${proposalId}/decision`} method="post">
          <textarea id="decision-reason" name="reason" rows={3} placeholder="Decision reason" style={{ ...inputStyle, margin: "8px 0 10px" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button name="decision" value="approved" disabled={decisionDisabled} style={{ ...buttonStyle, background: "#22c55e", color: "#0a0a0b" }}>Approve</button>
            <button name="decision" value="deferred" disabled={decisionDisabled} style={{ ...buttonStyle, background: "#f59e0b", color: "#0a0a0b" }}>Defer</button>
            <button name="decision" value="rejected" disabled={decisionDisabled} style={{ ...buttonStyle, background: "#ef4444", color: "#0a0a0b" }}>Reject</button>
          </div>
        </form>
      </section>

      {status === "approved" && (
        <form onSubmit={submitFill} style={panel}>
          <div style={title}>Manual Fill</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <input name="broker" required placeholder="Broker" style={inputStyle} />
            <input name="symbol" required defaultValue={symbol} style={inputStyle} />
            <select name="side" defaultValue="BUY" style={inputStyle}><option>BUY</option><option>SELL</option></select>
            <input name="quantity" required type="number" step="0.0001" min="0" placeholder="Quantity" style={inputStyle} />
            <input name="price" required type="number" step="0.01" min="0" placeholder="Price" style={inputStyle} />
            <input name="fees" type="number" step="0.01" min="0" placeholder="Fees" style={inputStyle} />
          </div>
          <textarea name="notes" rows={2} placeholder="Fill notes" style={{ ...inputStyle, marginTop: 8 }} />
          <button disabled={busy} style={{ ...buttonStyle, marginTop: 10, background: "#c8f542", color: "#0a0a0b" }}>Record Fill</button>
        </form>
      )}

      {status === "filled" && (
        <form onSubmit={submitPostmortem} style={panel}>
          <div style={title}>Postmortem</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            <input name="thesisOutcome" required placeholder="Thesis outcome" style={inputStyle} />
            <input name="processScore" required type="number" min="1" max="10" placeholder="Score" style={inputStyle} />
            <input name="pnl" type="number" step="0.01" placeholder="P/L" style={inputStyle} />
          </div>
          <input name="mistakeTaxonomy" required placeholder="Mistake taxonomy" style={{ ...inputStyle, marginTop: 8 }} />
          <textarea name="notes" required rows={3} placeholder="Postmortem notes" style={{ ...inputStyle, marginTop: 8 }} />
          <button disabled={busy} style={{ ...buttonStyle, marginTop: 10, background: "#c8f542", color: "#0a0a0b" }}>Save Postmortem</button>
        </form>
      )}

      {error && <div role="alert" style={{ color: "#ef4444", fontSize: 11 }}>{error}</div>}
    </div>
  );
}

const panel: CSSProperties = {
  background: "#111113",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: 14,
};

const title: CSSProperties = {
  fontFamily: '"Instrument Serif", serif',
  fontSize: 20,
};

function formatError(error: unknown): string {
  if (Array.isArray(error)) {
    return error
      .map((item) => {
        if (item && typeof item === "object" && "message" in item) {
          const path = "path" in item && Array.isArray((item as { path?: unknown }).path)
            ? (item as { path: unknown[] }).path.join(".")
            : "";
          return `${path ? `${path}: ` : ""}${String((item as { message: unknown }).message)}`;
        }
        return String(item);
      })
      .join("; ");
  }
  if (typeof error === "string" && error.length > 0) return error;
  return "Request failed";
}
