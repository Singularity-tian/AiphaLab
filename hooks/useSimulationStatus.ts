"use client";

import { useState, useEffect } from "react";

interface SimStatus {
  lastRunDate: string | null;
  lastRunAgents: number;
  nextEligibleDate: string | null;
  agentCount: number;
  isRunning: boolean;
}

interface DaemonStatus {
  alive: boolean;
  phase: string | null;
  lastPing: string | null;
  version: string | null;
}

export function useSimulationStatus(pollIntervalMs = 30_000) {
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [simRes, daemonRes] = await Promise.all([
          fetch("/api/simulation/status"),
          fetch("/api/daemon/status"),
        ]);
        const [sim, daemon] = await Promise.all([simRes.json(), daemonRes.json()]);
        setSimStatus(sim);
        setDaemonStatus(daemon);
      } catch {}
      setLoading(false);
    }

    fetchAll();
    const interval = setInterval(fetchAll, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs]);

  return { simStatus, daemonStatus, loading };
}
