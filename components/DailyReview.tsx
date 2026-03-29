const MOOD_EMOJI: Record<string, string> = {
  bullish: "🟢",
  cautious: "🟡",
  frustrated: "🔴",
  confident: "🔵",
  anxious: "🟠",
  neutral: "⚪",
  euphoric: "✨",
  depressed: "⬛",
};

interface Review {
  date: string;
  review_text: string;
  mood: string | null;
  dailyReturn?: number | null;
}

export default function DailyReview({ review }: { review: Review | null }) {
  if (!review) {
    return (
      <div
        style={{
          background: "#111113",
          border: "1px solid #27272a",
          borderRadius: 8,
          padding: 24,
          color: "#71717a",
          fontSize: 12,
        }}
      >
        No review yet.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#111113",
        border: "1px solid #27272a",
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span
          style={{
            fontFamily: '"Instrument Serif", serif',
            fontSize: 16,
          }}
        >
          Daily Journal
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {review.mood && (
            <span
              style={{
                fontSize: 11,
                color: "#a1a1aa",
                background: "#1e1e22",
                border: "1px solid #27272a",
                padding: "3px 10px",
                borderRadius: 3,
              }}
            >
              {MOOD_EMOJI[review.mood] ?? "⚪"} {review.mood}
            </span>
          )}
          {review.dailyReturn != null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: review.dailyReturn >= 0 ? "#22c55e" : "#ef4444",
                background: "#1e1e22",
                border: "1px solid #27272a",
                padding: "3px 10px",
                borderRadius: 3,
              }}
            >
              {review.dailyReturn >= 0 ? "+" : ""}{(review.dailyReturn * 100).toFixed(2)}%
            </span>
          )}
          <span style={{ fontSize: 11, color: "#71717a" }}>{review.date}</span>
        </div>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#a1a1aa",
          lineHeight: 1.8,
          fontStyle: "italic",
        }}
      >
        "{review.review_text}"
      </p>
    </div>
  );
}
