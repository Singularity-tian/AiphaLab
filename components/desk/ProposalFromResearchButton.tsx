"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProposalFromResearchButton({ reportId }: { reportId: number }) {
  const [instrumentType, setInstrumentType] = useState<"equity" | "option">("equity");
  const [phase, setPhase] = useState<"idle" | "running" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function start() {
    setPhase("running");
    setError(null);
    try {
      const res = await fetch("/api/desk/proposals/from-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, instrumentType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(formatError(json.error));
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
      <select
        value={instrumentType}
        onChange={(e) => setInstrumentType(e.target.value as "equity" | "option")}
        disabled={phase === "running"}
        style={{
          background: "#111113",
          color: "#fafafa",
          border: "1px solid #27272a",
          borderRadius: 4,
          padding: "7px 10px",
          fontFamily: '"DM Mono", monospace',
          fontSize: 11,
        }}
      >
        <option value="equity">Equity</option>
        <option value="option">Option</option>
      </select>
      <button
        type="button"
        onClick={start}
        disabled={phase === "running"}
        style={{
          background: "#c8f542",
          color: "#0a0a0b",
          border: "none",
          borderRadius: 4,
          padding: "8px 12px",
          fontFamily: '"DM Mono", monospace',
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: phase === "running" ? "default" : "pointer",
        }}
      >
        {phase === "running" ? "Drafting" : "Draft Proposal"}
      </button>
      {error && <span role="alert" style={{ color: "#ef4444", fontSize: 11 }}>{error}</span>}
    </div>
  );
}

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
  return "Failed to generate proposal";
}
