/**
 * DST-safe scheduler using luxon for ET timezone.
 * Checks every minute if it's time to run a phase.
 */

import { DateTime } from "luxon";

export type PhaseHandler = () => Promise<void>;

export interface ScheduledPhase {
  hour: number;    // ET hour
  minute: number;  // ET minute
  days?: number[]; // 0=Sun, 1=Mon ... 6=Sat. If omitted = Mon-Fri
  handler: PhaseHandler;
  name: string;
}

export class Scheduler {
  private phases: ScheduledPhase[] = [];
  private lastRun = new Map<string, string>(); // phase name → last date run
  private ticker: NodeJS.Timeout | null = null;

  register(phase: ScheduledPhase) {
    this.phases.push(phase);
  }

  start() {
    console.log("[scheduler] Starting...");
    this.ticker = setInterval(() => this._tick(), 60_000);
    this._tick(); // Run once immediately on start
  }

  stop() {
    if (this.ticker) clearInterval(this.ticker);
    console.log("[scheduler] Stopped.");
  }

  private async _tick() {
    const now = DateTime.now().setZone("America/New_York");
    const dateStr = now.toISODate()!;
    // Convert luxon weekday (1=Mon, 7=Sun) to JS day (0=Sun, 6=Sat)
    const jsDay = now.weekday === 7 ? 0 : now.weekday;

    for (const phase of this.phases) {
      const allowedDays = phase.days ?? [1, 2, 3, 4, 5]; // Mon-Fri by default

      if (!allowedDays.includes(jsDay)) continue;
      if (now.hour !== phase.hour || now.minute !== phase.minute) continue;

      const runKey = `${phase.name}:${dateStr}`;
      if (this.lastRun.get(runKey)) continue; // Already ran today

      this.lastRun.set(runKey, dateStr);
      console.log(`[scheduler] Triggering ${phase.name} at ${now.toISO()}`);

      try {
        await phase.handler();
      } catch (e) {
        console.error(`[scheduler] ${phase.name} failed:`, (e as Error).message ?? String(e));
      }
    }
  }
}
