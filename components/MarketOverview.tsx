"use client";

import { useSimulationStatus } from "@/hooks/useSimulationStatus";

export function MarketOverview() {
  const { simStatus, loading } = useSimulationStatus();

  if (loading || !simStatus) {
    return (
      <div className="flex items-center gap-6 text-[11px] text-tm uppercase tracking-widest">
        <span>Loading market data...</span>
      </div>
    );
  }

  const { lastRunDate, agentCount } = simStatus;

  return (
    <div className="flex items-center gap-6 text-[11px] text-tm uppercase tracking-widest">
      <span>
        Last Run:{" "}
        <span className="text-td">
          {lastRunDate ?? "—"}
        </span>
      </span>
      <span className="text-bd">|</span>
      <span>
        Agents:{" "}
        <span className="text-ac">{agentCount}</span>
      </span>
    </div>
  );
}
