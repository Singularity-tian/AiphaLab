"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "starting" | "running" | "failed";

/**
 * Ticker input at the top of the Research Library: POST /api/research, show
 * the new running row in the list (router.refresh), poll until done, then
 * navigate to the finished report. Mirrors DeepResearchButton's flow.
 */
export function NewResearchForm() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;

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
      setPhase("running");
      router.refresh(); // surface the new running row in the list below
      pollCountRef.current = 0;
      pollRef.current = setInterval(async () => {
        pollCountRef.current++;
        if (pollCountRef.current > 300) {
          if (pollRef.current) clearInterval(pollRef.current);
          setError("Timed out — check the list below");
          setPhase("failed");
          return;
        }
        try {
          const r = await fetch(`/api/research/${json.id}`);
          const row = await r.json();
          if (row.status === "complete") {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push(`/research/${json.id}`);
          } else if (row.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(row.error ?? "Generation failed");
            setPhase("failed");
            router.refresh();
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

  const busy = phase === "starting" || phase === "running";

  return (
    <div style={{ marginBottom: 32 }}>
      <form
        onSubmit={start}
        style={{
          display: "flex",
          maxWidth: 420,
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ticker for new research..."
          aria-label="Ticker for new research"
          disabled={busy}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "10px 14px",
            color: "#fafafa",
            fontFamily: '"DM Mono", monospace',
            fontSize: 12,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            background: busy ? "#27272a" : "#c8f542",
            color: busy ? "#71717a" : "#0a0a0b",
            border: "none",
            padding: "10px 18px",
            fontFamily: '"DM Mono", monospace',
            fontSize: 11,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: busy || !input.trim() ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "..." : "Research"}
        </button>
      </form>
      {phase === "running" && (
        <div style={{ fontSize: 11, color: "#71717a", marginTop: 8 }}>
          Research panel analyzing {input.trim().toUpperCase()}… ~1–2 min — you&apos;ll be taken to the report when it&apos;s ready.
        </div>
      )}
      {phase === "failed" && error && (
        <div role="alert" style={{ fontSize: 11, color: "#ef4444", marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
