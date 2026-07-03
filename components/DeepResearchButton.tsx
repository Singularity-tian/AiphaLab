"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "starting" | "running" | "done" | "failed";

export function DeepResearchButton({ ticker }: { ticker: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reportId, setReportId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<{ id: number; created_at: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset per ticker and look up the most recent existing report.
  useEffect(() => {
    setPhase("idle");
    setReportId(null);
    setError(null);
    setLastReport(null);
    let cancelled = false;
    fetch(`/api/research?ticker=${encodeURIComponent(ticker)}&limit=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.reports?.[0]?.status === "complete") {
          setLastReport({ id: d.reports[0].id, created_at: d.reports[0].created_at });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [ticker]);

  const start = async () => {
    setPhase("starting");
    setError(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to start");
        setPhase("failed");
        return;
      }
      setReportId(json.id);
      setPhase("running");
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/research/${json.id}`);
          const row = await r.json();
          if (row.status === "complete") {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("done");
          } else if (row.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(row.error ?? "Generation failed");
            setPhase("failed");
          }
        } catch {
          /* transient poll failure — keep polling */
        }
      }, 3000);
    } catch {
      setError("Network error");
      setPhase("failed");
    }
  };

  const linkStyle = { color: "#c8f542", fontSize: 11, textDecoration: "underline" } as const;

  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {(phase === "idle" || phase === "failed") && (
        <button
          type="button"
          onClick={start}
          style={{
            background: "#1e1e22", border: "1px solid #c8f542", color: "#c8f542",
            padding: "5px 12px", borderRadius: 4, fontSize: 11,
            fontFamily: '"DM Mono", monospace', textTransform: "uppercase",
            letterSpacing: "0.08em", cursor: "pointer",
          }}
        >
          {phase === "failed" ? "Retry Deep Research" : "Deep Research"}
        </button>
      )}
      {(phase === "starting" || phase === "running") && (
        <span style={{ fontSize: 11, color: "#71717a" }}>
          Research panel analyzing… ~1 min
        </span>
      )}
      {phase === "done" && reportId != null && (
        <a href={`/research/${reportId}`} style={linkStyle}>View report →</a>
      )}
      {phase === "failed" && error && (
        <span role="alert" style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>
      )}
      {lastReport && phase !== "done" && (
        <a href={`/research/${lastReport.id}`} style={linkStyle}>
          Last report: {lastReport.created_at.slice(0, 10)} →
        </a>
      )}
    </div>
  );
}
