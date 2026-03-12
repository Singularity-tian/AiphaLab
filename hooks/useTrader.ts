"use client";

import { useState, useEffect } from "react";

interface TraderDetail {
  id: number;
  name: string;
  initialCash: number;
  state: {
    cash: number;
    portfolio_value: number;
    total_pnl: number;
    run_count: number;
  };
  latestSnapshot: {
    portfolio_value: number;
    cumulative_return: number;
    daily_return: number;
    date: string;
  } | null;
  latestReview: {
    date: string;
    mood: string;
    content: string;
  } | null;
  positions: {
    ticker: string;
    shares: number;
    entryPrice: number;
    entryDate: string;
    trailingHigh: number;
    costBasis: number;
  }[];
}

export function useTrader(agentId: number | null, pollIntervalMs = 30_000) {
  const [trader, setTrader] = useState<TraderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) { setLoading(false); return; }

    async function fetchTrader() {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setTrader(data);
        setError(null);
      } catch {
        setError("Failed to load trader");
      } finally {
        setLoading(false);
      }
    }

    fetchTrader();
    const interval = setInterval(fetchTrader, pollIntervalMs);
    return () => clearInterval(interval);
  }, [agentId, pollIntervalMs]);

  return { trader, loading, error };
}
