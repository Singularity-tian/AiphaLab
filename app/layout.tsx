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
          <div style={{ display: "flex", gap: 24, fontSize: 11, color: "#71717a" }}>
            <a href="/" style={{ color: "inherit", textDecoration: "none" }}>
              Dashboard
            </a>
            <a href="/traders" style={{ color: "inherit", textDecoration: "none" }}>
              All Traders
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
