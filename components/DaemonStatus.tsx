"use client";

import { useSimulationStatus } from "@/hooks/useSimulationStatus";

export function DaemonStatus() {
  const { daemonStatus, loading } = useSimulationStatus();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-bd bg-s1">
        <span className="w-2 h-2 rounded-full bg-tm animate-pulse" />
        <span className="text-[11px] text-tm uppercase tracking-widest">connecting</span>
      </div>
    );
  }

  const alive = daemonStatus?.alive ?? false;
  const phase = daemonStatus?.phase ?? null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
        alive ? "border-grn/30 bg-grn/5" : "border-red/30 bg-red/5"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${alive ? "bg-grn" : "bg-red"} ${
          alive ? "shadow-[0_0_6px_#22c55e]" : ""
        }`}
      />
      <span className={`text-[11px] uppercase tracking-widest ${alive ? "text-grn" : "text-red"}`}>
        {alive ? phase ?? "daemon online" : "daemon offline"}
      </span>
    </div>
  );
}
