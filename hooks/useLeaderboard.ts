"use client";

import { useState, useEffect } from "react";

interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  strategy: string;
  portfolioValue: number;
  cumulativeReturn: number;
  dailyReturn: number;
  tradeCount: number;
  snapDate: string | null;
}

export function useLeaderboard(pollIntervalMs = 60_000) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setLeaderboard(data);
      setError(null);
    } catch (e) {
      setError("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs]);

  return { leaderboard, loading, error, refetch };
}
