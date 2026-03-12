"use client";

import { useState, useCallback } from "react";
import { SP500_UNIVERSE, ARCHETYPE_CLUSTERS } from "@/lib/persona";

interface CreateTraderSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: number) => void;
}

type Tab = "identity" | "strategy" | "beliefs";

export function CreateTraderSheet({ open, onClose, onCreated }: CreateTraderSheetProps) {
  const [tab, setTab] = useState<Tab>("identity");
  const [identity, setIdentity] = useState("");
  const [strategy, setStrategy] = useState("");
  const [beliefs, setBeliefs] = useState("{}");
  const [name, setName] = useState("");

  const [selectedArchetype, setSelectedArchetype] = useState(ARCHETYPE_CLUSTERS[0]);
  const [generating, setGenerating] = useState<"identity" | "strategy" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beliefsError, setBeliefsError] = useState<string | null>(null);

  const extractNameFromIdentity = (md: string): string => {
    const match = md.match(/^#\s+([^—\n]+)/m);
    return match ? match[1].trim() : "";
  };

  const handleGenerateIdentity = useCallback(async () => {
    setGenerating("identity");
    setError(null);
    try {
      const res = await fetch("/api/agents/generate-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetype: selectedArchetype }),
      });
      const data = await res.json();
      if (data.identity) {
        setIdentity(data.identity);
        const extractedName = extractNameFromIdentity(data.identity);
        if (extractedName) setName(extractedName);
      } else {
        setError("Failed to generate identity");
      }
    } catch {
      setError("Network error generating identity");
    } finally {
      setGenerating(null);
    }
  }, [selectedArchetype]);

  const handleGenerateStrategy = useCallback(async () => {
    if (!identity) { setError("Generate identity first"); return; }
    setGenerating("strategy");
    setError(null);
    try {
      const res = await fetch("/api/agents/generate-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity }),
      });
      const data = await res.json();
      if (data.strategy) {
        setStrategy(data.strategy);
      } else {
        setError("Failed to generate strategy");
      }
    } catch {
      setError("Network error generating strategy");
    } finally {
      setGenerating(null);
    }
  }, [identity]);

  const handleBeliefsChange = (val: string) => {
    setBeliefs(val);
    try {
      JSON.parse(val);
      setBeliefsError(null);
    } catch {
      setBeliefsError("Invalid JSON");
    }
  };

  const handleSubmit = async () => {
    if (!identity.trim() || !strategy.trim() || !name.trim()) {
      setError("Identity, strategy, and name are required");
      return;
    }
    if (beliefsError) { setError("Fix beliefs JSON first"); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity,
          strategy,
          beliefs: JSON.parse(beliefs),
          name,

        }),
      });
      const data = await res.json();
      if (data.agentId) {
        onCreated(data.agentId);
        // Reset
        setIdentity(""); setStrategy(""); setBeliefs("{}");
        setName(""); setTab("identity");
      } else {
        setError(JSON.stringify(data.error));
      }
    } catch {
      setError("Network error creating agent");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="w-[640px] h-full bg-s1 border-l border-bd flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bd">
          <div>
            <p className="text-[10px] uppercase tracking-[1.5px] text-tm mb-1">New Trader</p>
            <h2 className="text-lg font-serif text-t">Create LLM Trader</h2>
          </div>
          <button onClick={onClose} className="text-tm hover:text-t text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-bd px-6">
          {(["identity", "strategy", "beliefs"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-[11px] uppercase tracking-widest transition-colors ${
                tab === t
                  ? "text-ac border-b-2 border-ac"
                  : "text-tm hover:text-td"
              }`}
            >
              {t}
              {t === "identity" && identity ? " ✓" : ""}
              {t === "strategy" && strategy ? " ✓" : ""}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Identity Tab */}
          {tab === "identity" && (
            <div className="space-y-5">
              {/* Archetype picker */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-tm mb-2">Archetype</label>
                <select
                  value={selectedArchetype}
                  onChange={(e) => setSelectedArchetype(e.target.value)}
                  className="w-full bg-s2 border border-bd rounded px-3 py-2 text-td text-[12px] focus:outline-none focus:border-ac/50"
                >
                  {ARCHETYPE_CLUSTERS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerateIdentity}
                disabled={generating === "identity"}
                className="flex items-center gap-2 px-4 py-2 bg-ac text-bg rounded text-[11px] uppercase tracking-widest font-medium hover:bg-acd disabled:opacity-50 transition-colors"
              >
                {generating === "identity" ? (
                  <><span className="animate-spin">⟳</span> Generating...</>
                ) : (
                  "Generate with AI"
                )}
              </button>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-tm mb-2">
                  identity.md <span className="normal-case text-tm/60">(editable)</span>
                </label>
                <textarea
                  value={identity}
                  onChange={(e) => {
                    setIdentity(e.target.value);
                    const n = extractNameFromIdentity(e.target.value);
                    if (n) setName(n);
                  }}
                  placeholder="Generate with AI or write your own identity.md..."
                  className="w-full h-[240px] bg-s2 border border-bd rounded px-3 py-2 text-td text-[12px] font-mono resize-none focus:outline-none focus:border-ac/50"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-tm mb-2">Name (auto-extracted)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Trader name"
                  className="w-full bg-s2 border border-bd rounded px-3 py-2 text-td text-[12px] focus:outline-none focus:border-ac/50"
                />
              </div>
            </div>
          )}

          {/* Strategy Tab */}
          {tab === "strategy" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateStrategy}
                  disabled={generating === "strategy" || !identity}
                  className="flex items-center gap-2 px-4 py-2 bg-ac text-bg rounded text-[11px] uppercase tracking-widest font-medium hover:bg-acd disabled:opacity-50 transition-colors"
                >
                  {generating === "strategy" ? (
                    <><span className="animate-spin">⟳</span> Generating...</>
                  ) : (
                    "Generate from Identity"
                  )}
                </button>
                {!identity && (
                  <span className="text-[11px] text-org">Set identity first</span>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-tm mb-2">strategy.md</label>
                <textarea
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  placeholder="Generate from identity or write your own strategy.md..."
                  className="w-full h-[280px] bg-s2 border border-bd rounded px-3 py-2 text-td text-[12px] font-mono resize-none focus:outline-none focus:border-ac/50"
                />
              </div>
            </div>
          )}

          {/* Beliefs Tab */}
          {tab === "beliefs" && (
            <div className="space-y-4">
              <p className="text-[12px] text-td">
                Initial beliefs.json — leave as <code className="text-ac">{"{}"}</code> to start fresh,
                or pre-populate ticker beliefs.
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-tm mb-2">beliefs.json</label>
                <textarea
                  value={beliefs}
                  onChange={(e) => handleBeliefsChange(e.target.value)}
                  className={`w-full h-[300px] bg-s2 border rounded px-3 py-2 text-td text-[12px] font-mono resize-none focus:outline-none transition-colors ${
                    beliefsError ? "border-red/50 focus:border-red" : "border-bd focus:border-ac/50"
                  }`}
                />
                {beliefsError && (
                  <p className="text-[11px] text-red mt-1">{beliefsError}</p>
                )}
              </div>

              {/* Watchlist reference */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-tm mb-2">S&P 500 Universe (reference)</p>
                <div className="flex flex-wrap gap-1">
                  {SP500_UNIVERSE.slice(0, 30).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 bg-s3 border border-bds rounded text-[10px] text-tm">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-bd flex items-center justify-between">
          <div>
            {error && <p className="text-[12px] text-red">{error}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[11px] uppercase tracking-widest text-tm hover:text-td transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !identity || !strategy || !name || !!beliefsError}
              className="px-5 py-2 bg-ac text-bg rounded text-[11px] uppercase tracking-widest font-medium hover:bg-acd disabled:opacity-40 transition-colors"
            >
              {submitting ? "Creating..." : "Create Trader"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
