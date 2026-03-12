"use client";

import { useState, useCallback, useRef } from "react";
import { SP500_UNIVERSE, ARCHETYPE_CLUSTERS } from "@/lib/persona";

interface CreateTraderSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: number) => void;
}

type Tab = "identity" | "strategy" | "beliefs";

const STEPS: { key: Tab; label: string; num: string }[] = [
  { key: "identity", label: "Identity", num: "01" },
  { key: "strategy", label: "Strategy", num: "02" },
  { key: "beliefs", label: "Beliefs", num: "03" },
];

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
  const [showTickers, setShowTickers] = useState(false);
  const submittingRef = useRef(false);

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
    if (submittingRef.current) return;
    if (!identity.trim() || !strategy.trim() || !name.trim()) {
      setError("Identity, strategy, and name are required");
      return;
    }
    if (beliefsError) { setError("Fix beliefs JSON first"); return; }

    submittingRef.current = true;
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
        setIdentity(""); setStrategy(""); setBeliefs("{}");
        setName(""); setTab("identity");
      } else {
        setError(JSON.stringify(data.error));
      }
    } catch {
      setError("Network error creating agent");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const isStepComplete = (step: Tab) => {
    if (step === "identity") return !!identity;
    if (step === "strategy") return !!strategy;
    if (step === "beliefs") return beliefs !== "{}";
    return false;
  };

  const completedCount = [identity, strategy].filter(Boolean).length + (beliefs !== "{}" ? 1 : 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: "fadeIn 0.2s ease-out" }}
      />

      {/* Sheet */}
      <div
        className="w-[820px] h-full bg-bg border-l border-bd flex flex-col overflow-hidden shadow-2xl relative"
        style={{ animation: "slideInRight 0.3s ease-out" }}
      >
        {/* Top accent gradient line */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{ background: "linear-gradient(90deg, transparent, #c8f542, transparent)" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-bd">
          <div>
            <p className="text-[10px] uppercase tracking-[1.5px] text-tm mb-1.5">New Trader</p>
            <h2 className="text-2xl font-serif text-t" style={{ letterSpacing: "-0.5px" }}>
              Create LLM Trader
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-s2 border border-bd flex items-center justify-center text-tm hover:text-t hover:border-ac/50 transition-colors text-sm"
          >
            &times;
          </button>
        </div>

        {/* Step Progress Indicator */}
        <div className="px-8 py-5 border-b border-bd bg-s1">
          <div className="flex gap-3">
            {STEPS.map((step, i) => {
              const isActive = tab === step.key;
              const isComplete = isStepComplete(step.key);

              return (
                <button
                  key={step.key}
                  onClick={() => setTab(step.key)}
                  className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                    isActive
                      ? "bg-s2 border-ac/30"
                      : isComplete
                        ? "bg-s2 border-bd hover:border-ac/20"
                        : "bg-transparent border-transparent hover:bg-s2/50"
                  }`}
                >
                  {/* Step number circle */}
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${
                      isActive
                        ? "bg-ac text-bg"
                        : isComplete
                          ? "bg-grn/20 text-grn"
                          : "bg-s3 text-tm"
                    }`}
                  >
                    {isComplete && !isActive ? (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      step.num
                    )}
                  </span>
                  <span className={`text-[11px] uppercase tracking-widest ${
                    isActive ? "text-ac" : isComplete ? "text-td" : "text-tm"
                  }`}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          <div key={tab} style={{ animation: "fadeIn 0.15s ease-out" }}>

            {/* Identity Tab */}
            {tab === "identity" && (
              <div className="space-y-6">
                {/* Archetype section */}
                <div className="bg-s1 border border-bd rounded-lg p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-[5px] h-[5px] rounded-full bg-ac" />
                    <span className="font-serif text-base text-t">Choose Archetype</span>
                  </div>
                  <select
                    value={selectedArchetype}
                    onChange={(e) => setSelectedArchetype(e.target.value)}
                    className="w-full bg-s3 border border-bd rounded-lg px-4 py-3 text-td text-[13px] focus:outline-none focus:border-ac/50 transition-colors"
                  >
                    {ARCHETYPE_CLUSTERS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-tm mt-2.5">
                    Defines personality traits, risk tolerance, and trading philosophy
                  </p>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerateIdentity}
                  disabled={generating === "identity"}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-bg text-[12px] uppercase tracking-[2px] font-medium disabled:opacity-40 transition-all"
                  style={{
                    background: generating === "identity"
                      ? "#a5cc30"
                      : "linear-gradient(135deg, #c8f542, #a5cc30)",
                    boxShadow: generating === "identity"
                      ? "none"
                      : "0 0 20px rgba(200,245,66,0.15)",
                  }}
                >
                  {generating === "identity" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate with AI"
                  )}
                </button>

                {/* Identity textarea */}
                <div className="bg-s1 border border-bd rounded-lg p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-[5px] h-[5px] rounded-full bg-ac" />
                    <span className="font-serif text-base text-t">identity.md</span>
                    <span className="text-[10px] text-tm/60 ml-1">(editable)</span>
                  </div>
                  <textarea
                    value={identity}
                    onChange={(e) => {
                      setIdentity(e.target.value);
                      const n = extractNameFromIdentity(e.target.value);
                      if (n) setName(n);
                    }}
                    placeholder="Generate with AI or write your own identity.md..."
                    className="w-full h-[360px] bg-s2 border border-bd rounded-lg px-4 py-4 text-td text-[13px] font-mono resize-none focus:outline-none focus:border-ac/50 transition-colors leading-relaxed"
                    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)" }}
                  />
                </div>

                {/* Name input */}
                <div className="bg-s1 border border-bd rounded-lg p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-[5px] h-[5px] rounded-full bg-ac" />
                    <span className="font-serif text-base text-t">Trader Name</span>
                    <span className="text-[10px] text-tm/60 ml-1">(auto-extracted)</span>
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Trader name"
                    className={`w-full bg-s2 border rounded-lg px-4 py-3 text-td text-[13px] focus:outline-none focus:border-ac/50 transition-colors ${
                      name ? "border-l-2 border-l-ac border-bd" : "border-bd"
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Strategy Tab */}
            {tab === "strategy" && (
              <div className="space-y-6">
                {/* Context banner */}
                {!identity ? (
                  <div className="flex items-center gap-3 bg-org/5 border border-org/20 rounded-lg p-4">
                    <span className="text-org text-lg">&larr;</span>
                    <div>
                      <p className="text-[12px] text-org font-medium">Identity required</p>
                      <p className="text-[11px] text-tm mt-0.5">Complete Step 01 to generate a strategy</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-grn/5 border border-grn/20 rounded-lg p-4">
                    <span className="w-5 h-5 rounded-full bg-grn/20 flex items-center justify-center">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div>
                      <p className="text-[12px] text-grn font-medium">Identity loaded</p>
                      {name && <p className="text-[11px] text-tm mt-0.5">{name}</p>}
                    </div>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerateStrategy}
                  disabled={generating === "strategy" || !identity}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-lg text-bg text-[12px] uppercase tracking-[2px] font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: !identity
                      ? "#71717a"
                      : generating === "strategy"
                        ? "#a5cc30"
                        : "linear-gradient(135deg, #c8f542, #a5cc30)",
                    boxShadow: !identity || generating === "strategy"
                      ? "none"
                      : "0 0 20px rgba(200,245,66,0.15)",
                  }}
                >
                  {generating === "strategy" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate from Identity"
                  )}
                </button>

                {/* Strategy textarea */}
                <div className="bg-s1 border border-bd rounded-lg p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-[5px] h-[5px] rounded-full bg-ac" />
                    <span className="font-serif text-base text-t">strategy.md</span>
                  </div>
                  <textarea
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    placeholder="Generate from identity or write your own strategy.md..."
                    className="w-full h-[400px] bg-s2 border border-bd rounded-lg px-4 py-4 text-td text-[13px] font-mono resize-none focus:outline-none focus:border-ac/50 transition-colors leading-relaxed"
                    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)" }}
                  />
                </div>
              </div>
            )}

            {/* Beliefs Tab */}
            {tab === "beliefs" && (
              <div className="space-y-6">
                {/* Info card */}
                <div className="flex items-start gap-3 bg-blu/5 border border-blu/20 rounded-lg p-4">
                  <span className="text-blu text-sm mt-0.5">i</span>
                  <p className="text-[12px] text-td leading-relaxed">
                    Initial beliefs.json — leave as <code className="text-ac px-1 py-0.5 bg-s2 rounded text-[11px]">{"{}"}</code> to
                    start fresh, or pre-populate with ticker beliefs.
                  </p>
                </div>

                {/* Beliefs textarea */}
                <div className="bg-s1 border border-bd rounded-lg p-6">
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="w-[5px] h-[5px] rounded-full bg-ac" />
                    <span className="font-serif text-base text-t">beliefs.json</span>
                  </div>
                  <textarea
                    value={beliefs}
                    onChange={(e) => handleBeliefsChange(e.target.value)}
                    className={`w-full h-[360px] bg-s2 border rounded-lg px-4 py-4 text-td text-[13px] font-mono resize-none focus:outline-none transition-colors leading-relaxed ${
                      beliefsError ? "border-red/50 focus:border-red" : "border-bd focus:border-ac/50"
                    }`}
                    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)" }}
                  />
                  {beliefsError && (
                    <p className="text-[11px] text-red mt-2 bg-red/10 border border-red/20 rounded px-3 py-1 inline-block">
                      {beliefsError}
                    </p>
                  )}
                </div>

                {/* Collapsible S&P 500 reference */}
                <div className="bg-s1 border border-bd rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowTickers(!showTickers)}
                    className="w-full flex items-center justify-between px-6 py-4 text-[10px] uppercase tracking-widest text-tm hover:text-td transition-colors"
                  >
                    <span>S&P 500 Universe (reference)</span>
                    <span className="text-[14px]">{showTickers ? "\u2212" : "+"}</span>
                  </button>
                  {showTickers && (
                    <div className="px-6 pb-5 max-h-[140px] overflow-y-auto" style={{ animation: "fadeIn 0.15s ease-out" }}>
                      <div className="flex flex-wrap gap-1.5">
                        {SP500_UNIVERSE.slice(0, 30).map((t) => (
                          <span key={t} className="px-2 py-1 bg-s3 border border-bds rounded text-[11px] text-tm">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-bd">
          {/* Top accent line */}
          <div className="flex items-center justify-between">
            {/* Left: completion status + error */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {STEPS.map((step) => (
                  <span
                    key={step.key}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      isStepComplete(step.key) ? "bg-grn" : "bg-s3"
                    }`}
                  />
                ))}
                <span className="text-[11px] text-tm ml-1">
                  {completedCount} of 3
                </span>
              </div>
              {error && (
                <span className="text-[12px] text-red bg-red/10 border border-red/20 rounded px-3 py-1">
                  {error}
                </span>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg border border-bd text-[11px] uppercase tracking-widest text-tm hover:text-td hover:border-ac/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !identity || !strategy || !name || !!beliefsError}
                className="px-6 py-2.5 rounded-lg text-bg text-[11px] uppercase tracking-widest font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                style={{
                  background: submitting || !identity || !strategy || !name
                    ? "#71717a"
                    : "linear-gradient(135deg, #c8f542, #a5cc30)",
                  boxShadow: submitting || !identity || !strategy || !name
                    ? "none"
                    : "0 0 20px rgba(200,245,66,0.15)",
                }}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Trader"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
