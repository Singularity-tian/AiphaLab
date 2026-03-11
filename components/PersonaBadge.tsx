interface Persona {
  name: string;
  age: number;
  background: string;
  personalityTraits: string[];
  riskTolerance: string;
  tradingStyle: string;
  quirks: string[];
  preferredStrategy: string;
  description: string;
}

const riskColor: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  reckless: "#c8f542",
};

export default function PersonaBadge({ persona }: { persona: Persona }) {
  return (
    <div
      style={{
        background: "#111113",
        border: "1px solid #27272a",
        borderRadius: 8,
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent, #c8f542, transparent)",
        }}
      />

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 28,
            letterSpacing: -0.5,
            marginBottom: 4,
          }}
        >
          {persona.name}
        </div>
        <div style={{ fontSize: 12, color: "#71717a" }}>
          Age {persona.age} · {persona.tradingStyle}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.7, marginBottom: 16 }}>
        {persona.description}
      </p>

      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#71717a",
            marginBottom: 8,
          }}
        >
          Traits
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              background: "#1e1e22",
              border: `1px solid ${riskColor[persona.riskTolerance] ?? "#27272a"}`,
              color: riskColor[persona.riskTolerance] ?? "#a1a1aa",
              padding: "3px 10px",
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {persona.riskTolerance} risk
          </span>
          {persona.personalityTraits.map((t) => (
            <span
              key={t}
              style={{
                background: "#1e1e22",
                border: "1px solid #27272a",
                color: "#a1a1aa",
                padding: "3px 10px",
                borderRadius: 3,
                fontSize: 11,
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "#71717a",
            marginBottom: 8,
          }}
        >
          Quirks
        </div>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {persona.quirks.map((q) => (
            <li
              key={q}
              style={{
                fontSize: 12,
                color: "#a1a1aa",
                padding: "3px 0",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span style={{ color: "#c8f542", fontSize: 10, flexShrink: 0 }}>›</span>
              {q}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
