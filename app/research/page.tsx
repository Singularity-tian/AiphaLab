import Link from "next/link";
import { SimDB } from "@/lib/db/repository";
import { presentStatus } from "@/lib/research/lenses";

export const dynamic = "force-dynamic";

function tldrLine(head: string | null): string {
  if (!head) return "";
  const lines = head.split("\n").map((l) => l.trim());
  const bullet = lines.find((l) => l.startsWith("-") || l.startsWith("*"));
  return (bullet ?? lines.find((l) => l.length > 0 && !l.startsWith("#")) ?? "").slice(0, 140);
}

export default async function ResearchLibraryPage() {
  const db = new SimDB();
  const reports = await db.listResearchReports(undefined, 100).catch(() => []);

  return (
    <div>
      <header style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 32, fontWeight: 400, letterSpacing: -0.5, marginBottom: 8 }}>
          Research Library
        </h1>
        <p style={{ color: "#71717a", fontSize: 13 }}>{reports.length} reports</p>
      </header>

      {reports.length === 0 ? (
        <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 48, textAlign: "center", color: "#71717a", fontSize: 13 }}>
          No reports yet. Generate one from the stock analyzer on the dashboard.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reports.map((r) => {
            const status = presentStatus(r).status;
            const statusColor = status === "complete" ? "#22c55e" : status === "failed" ? "#ef4444" : "#f59e0b";
            return (
              <Link key={r.id} href={`/research/${r.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "baseline", gap: 14 }}>
                  <span style={{ fontFamily: '"Instrument Serif", serif', fontSize: 18, color: "#fafafa", minWidth: 64 }}>{r.ticker}</span>
                  <span style={{ fontSize: 10, color: statusColor, textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 70 }}>{status}</span>
                  <span style={{ fontSize: 11, color: "#a1a1aa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tldrLine(r.report_head)}
                  </span>
                  <span style={{ fontSize: 10, color: "#71717a" }}>{r.created_at.slice(0, 10)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
