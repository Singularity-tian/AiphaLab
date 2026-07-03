"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RetryResearchButton({ ticker }: { ticker: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const retry = async () => {
    setBusy(true);
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
        setBusy(false);
        return;
      }
      router.push(`/research/${json.id}`);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        style={{
          background: "#1e1e22", border: "1px solid #c8f542", color: busy ? "#71717a" : "#c8f542",
          padding: "5px 12px", borderRadius: 4, fontSize: 11,
          fontFamily: '"DM Mono", monospace', textTransform: "uppercase",
          letterSpacing: "0.08em", cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Starting…" : "Retry Deep Research"}
      </button>
      {error && <span role="alert" style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
    </div>
  );
}
