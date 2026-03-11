"use client";

import { useState } from "react";

interface Props {
  strategy: string;
}

interface Section {
  title: string;
  content: string;
}

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (currentTitle || currentLines.length > 0) {
        sections.push({
          title: currentTitle || "Overview",
          content: currentLines.join("\n").trim(),
        });
      }
      currentTitle = headingMatch[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle || currentLines.length > 0) {
    sections.push({
      title: currentTitle || "Overview",
      content: currentLines.join("\n").trim(),
    });
  }

  return sections.filter((s) => s.content.length > 0);
}

export default function StrategyView({ strategy }: Props) {
  const sections = parseSections(strategy);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  if (!strategy.trim()) {
    return (
      <div
        style={{
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 8,
          padding: "24px 16px",
          textAlign: "center",
          color: "#71717a",
          fontSize: 12,
        }}
      >
        No strategy document
      </div>
    );
  }

  const toggle = (idx: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div
      style={{
        background: "#111113",
        border: "1px solid #27272a",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #27272a",
          fontFamily: '"Instrument Serif", serif',
          fontSize: 16,
        }}
      >
        Strategy
      </div>

      {sections.map((section, i) => (
        <div key={i}>
          <button
            onClick={() => toggle(i)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid #1c1c1f",
              color: "#fafafa",
              cursor: "pointer",
              fontFamily: '"DM Mono", monospace',
              fontSize: 12,
              fontWeight: 500,
              textAlign: "left",
            }}
          >
            <span>{section.title}</span>
            <span
              style={{
                color: "#71717a",
                fontSize: 10,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              {collapsed.has(i) ? "+" : "−"}
            </span>
          </button>

          {!collapsed.has(i) && (
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #1c1c1f",
                background: "#0e0e10",
              }}
            >
              <pre
                style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: "#a1a1aa",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {section.content}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
