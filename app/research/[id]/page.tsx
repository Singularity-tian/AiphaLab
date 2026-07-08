import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { SimDB } from "@/lib/db/repository";
import { presentStatus, LENSES } from "@/lib/research/lenses";
import { RetryResearchButton } from "@/components/RetryResearchButton";
import { ProposalFromResearchButton } from "@/components/desk/ProposalFromResearchButton";

export const dynamic = "force-dynamic";

export default async function ResearchReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const db = new SimDB();
  const row = await db.getResearchReport(numId).catch(() => null);
  if (!row) notFound();
  const presented = presentStatus(row);
  const status = presented.status;
  const error = presented.error ?? row.error;

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/research" style={{ color: "#71717a", fontSize: 11, textDecoration: "none" }}>
          ← Research Library
        </Link>
      </div>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 32, fontWeight: 400, letterSpacing: -0.5 }}>
          {row.ticker} <span style={{ color: "#71717a", fontSize: 16 }}>research report</span>
        </h1>
        <p style={{ color: "#71717a", fontSize: 11, marginTop: 4 }}>
          Generated {row.created_at.slice(0, 16).replace("T", " ")} · status: {status}
        </p>
        {status === "complete" && <ProposalFromResearchButton reportId={row.id} />}
      </header>

      {status === "running" && (
        <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 32, color: "#f59e0b", fontSize: 13 }}>
          Research panel is still analyzing — refresh in a minute.
        </div>
      )}

      {status === "failed" && (
        <div style={{ background: "#111113", border: "1px solid #ef4444", borderRadius: 8, padding: 32, color: "#ef4444", fontSize: 13 }}>
          Generation failed: {error ?? "unknown error"}
          <RetryResearchButton ticker={row.ticker} />
        </div>
      )}

      {status === "complete" && row.report_md && (
        <>
          <article
            className="research-md"
            style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: "28px 32px", fontSize: 13, lineHeight: 1.7, color: "#d4d4d8" }}
          >
            <ReactMarkdown>{row.report_md}</ReactMarkdown>
          </article>

          <details style={{ marginTop: 16 }}>
            <summary style={{ fontSize: 11, color: "#71717a", cursor: "pointer" }}>Raw lens outputs</summary>
            {LENSES.map((l) =>
              row.lenses_json?.[l.key] ? (
                <div key={l.key} style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 16, marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: "#c8f542", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{l.title}</div>
                  <pre style={{ fontSize: 11, color: "#a1a1aa", whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{row.lenses_json[l.key]}</pre>
                </div>
              ) : null
            )}
          </details>

          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: "#71717a", cursor: "pointer" }}>Data snapshot (figures as of generation)</summary>
            <pre style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 8, padding: 16, marginTop: 8, fontSize: 10, color: "#71717a", overflow: "auto", maxHeight: 400 }}>
              {JSON.stringify(row.data_snapshot_json, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
