import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiphaLab — AI Trader Simulation",
  description: "100 LLM-powered traders simulating the market",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "#0a0a0b", minHeight: "100vh" }}>
        <nav
          style={{
            borderBottom: "1px solid #27272a",
            padding: "0 32px",
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "#0a0a0b",
            zIndex: 100,
          }}
        >
          <a
            href="/"
            style={{
              fontFamily: '"Instrument Serif", serif',
              fontSize: 20,
              color: "#fafafa",
              textDecoration: "none",
              letterSpacing: -0.5,
            }}
          >
            Aipha<span style={{ color: "#c8f542", fontStyle: "italic" }}>Lab</span>
          </a>
          <div style={{ display: "flex", gap: 24, fontSize: 11, color: "#71717a", alignItems: "center" }}>
            <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
              Dashboard
            </a>
            <a href="/traders" style={{ color: "inherit", textDecoration: "none" }}>
              All Traders
            </a>
            <a href="/research" style={{ color: "inherit", textDecoration: "none" }}>
              Research
            </a>
            <a
              href="https://github.com/Singularity-tian/AiphaLab"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", display: "flex" }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          </div>
        </nav>
        <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 32px 80px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
