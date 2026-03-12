#!/usr/bin/env tsx
/**
 * AiphaLab Daemon — entry point.
 * Long-running process: scheduler, heartbeat, graceful SIGTERM.
 *
 * Usage:
 *   pnpm daemon                          — start full scheduler
 *   pnpm daemon -- --phase preMarket --date 2025-01-06  — manual single phase
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { DateTime } from "luxon";
import { SimDB } from "../lib/db/repository";
import { getFmp } from "../lib/fmp";
import { type IFileStore, getFileStore } from "../lib/fileStore";
import { getEmbeddingClient } from "../lib/embeddings";
import { fmpBucket, llmBucket } from "./rateLimiter";
import { Scheduler } from "./scheduler";
import { runPreMarket } from "./phases/preMarket";
import { runMarketOpen } from "./phases/marketOpen";
import { runMidday } from "./phases/midday";
import { runMarketClose } from "./phases/marketClose";
import { runAfterHours } from "./phases/afterHours";
import { runWeeklyReview } from "./phases/weeklyReview";
import { runPriceMonitor } from "./priceMonitor";

const VERSION = "3.0.0";

// ---- Singletons ----
const db = new SimDB();
const fmp = getFmp();
const fileStore: IFileStore = getFileStore();
const embeddings = getEmbeddingClient();

// ---- CLI flag parsing ----
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const phaseArg = getArg("--phase");
const dateArg = getArg("--date");

// ---- Market context helper ----
async function buildMarketContext(date: string) {
  try {
    const spyHistory = await fmp.getDailyOHLC("SPY", "", date);
    const sorted = spyHistory.sort((a: any, b: any) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const prev1 = sorted[sorted.length - 2];
    const prev5 = sorted[sorted.length - 6];
    const ret1d = prev1 ? (last.close - prev1.close) / prev1.close : 0;
    const ret5d = prev5 ? (last.close - prev5.close) / prev5.close : 0;
    const regime = ret5d > 0.02 ? "trending_up" : ret5d < -0.02 ? "trending_down" : "choppy";
    return { date, spyReturn1d: ret1d, spyReturn5d: ret5d, vixLevel: null as null, marketRegime: regime as any };
  } catch {
    return { date, spyReturn1d: 0, spyReturn5d: 0, vixLevel: null as null, marketRegime: "choppy" as const };
  }
}

// ---- Manual single-phase mode ----
async function runSinglePhase(phase: string, date: string) {
  console.log(`\n[daemon] Manual phase: ${phase} for ${date}\n`);
  const ctx = await buildMarketContext(date);

  switch (phase) {
    case "preMarket":    await runPreMarket(date, db, fmp, fileStore); break;
    case "marketOpen":   await runMarketOpen(date, ctx, db, fmp, fileStore, embeddings, llmBucket); break;
    case "midday":       await runMidday(date, ctx, db, fmp, fileStore); break;
    case "marketClose":  await runMarketClose(date, db, fmp); break;
    case "afterHours":   await runAfterHours(date, ctx, db, fmp, fileStore, embeddings, llmBucket); break;
    case "weeklyReview": await runWeeklyReview(db, fileStore, llmBucket); break;
    default: console.error(`Unknown phase: ${phase}`); process.exit(1);
  }

  console.log(`\n[daemon] Phase ${phase} complete.\n`);
  process.exit(0);
}

// ---- Heartbeat loop ----
async function heartbeatLoop() {
  while (true) {
    try {
      await db.upsertDaemonHeartbeat("idle", VERSION);
    } catch {}
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

// ---- Full scheduler mode ----
async function startScheduler() {
  console.log(`\n[daemon] AiphaLab Daemon v${VERSION} starting...\n`);

  const scheduler = new Scheduler();

  scheduler.register({
    name: "preMarket",
    hour: 9, minute: 0,
    handler: async () => {
      const date = DateTime.now().setZone("America/New_York").toISODate()!;
      await db.upsertDaemonHeartbeat("preMarket", VERSION);
      await runPreMarket(date, db, fmp, fileStore);
    },
  });

  scheduler.register({
    name: "marketOpen",
    hour: 9, minute: 35,
    handler: async () => {
      const date = DateTime.now().setZone("America/New_York").toISODate()!;
      const ctx = await buildMarketContext(date);
      await db.upsertDaemonHeartbeat("marketOpen", VERSION);
      await runMarketOpen(date, ctx, db, fmp, fileStore, embeddings, llmBucket);
    },
  });

  scheduler.register({
    name: "midday",
    hour: 12, minute: 30,
    handler: async () => {
      const date = DateTime.now().setZone("America/New_York").toISODate()!;
      const ctx = await buildMarketContext(date);
      await db.upsertDaemonHeartbeat("midday", VERSION);
      await runMidday(date, ctx, db, fmp, fileStore);
    },
  });

  scheduler.register({
    name: "marketClose",
    hour: 15, minute: 55,
    handler: async () => {
      const date = DateTime.now().setZone("America/New_York").toISODate()!;
      await db.upsertDaemonHeartbeat("marketClose", VERSION);
      await runMarketClose(date, db, fmp);
    },
  });

  scheduler.register({
    name: "afterHours",
    hour: 16, minute: 30,
    handler: async () => {
      const date = DateTime.now().setZone("America/New_York").toISODate()!;
      const ctx = await buildMarketContext(date);
      await db.upsertDaemonHeartbeat("afterHours", VERSION);
      await runAfterHours(date, ctx, db, fmp, fileStore, embeddings, llmBucket);
    },
  });

  // Weekly review: Sunday 20:00 ET
  scheduler.register({
    name: "weeklyReview",
    hour: 20, minute: 0,
    days: [0], // Sunday
    handler: async () => {
      await db.upsertDaemonHeartbeat("weeklyReview", VERSION);
      await runWeeklyReview(db, fileStore, llmBucket);
    },
  });

  // Price monitor: every 5 minutes during market hours
  // Implemented as a separate interval
  let priceMonitorRunning = false;
  const priceMonitorInterval = setInterval(async () => {
    if (priceMonitorRunning) return;
    const now = DateTime.now().setZone("America/New_York");
    const jsDay = now.weekday === 7 ? 0 : now.weekday;
    const isWeekday = jsDay >= 1 && jsDay <= 5;
    const isMarketHours = (now.hour > 9 || (now.hour === 9 && now.minute >= 35)) && now.hour < 16;

    if (!isWeekday || !isMarketHours) return;

    priceMonitorRunning = true;
    const date = now.toISODate()!;
    const ctx = await buildMarketContext(date);
    try {
      await runPriceMonitor(date, ctx, db, fmp, fileStore, embeddings, llmBucket);
    } catch (e) {
      console.error("[daemon] priceMonitor error:", e);
    } finally {
      priceMonitorRunning = false;
    }
  }, 5 * 60 * 1000);

  scheduler.start();
  heartbeatLoop().catch(console.error);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[daemon] Shutting down gracefully...");
    scheduler.stop();
    clearInterval(priceMonitorInterval);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("[daemon] Scheduler running. Press Ctrl+C to stop.\n");
}

// ---- Entry point ----
if (phaseArg && dateArg) {
  runSinglePhase(phaseArg, dateArg).catch((e) => { console.error(e); process.exit(1); });
} else {
  startScheduler().catch((e) => { console.error(e); process.exit(1); });
}
