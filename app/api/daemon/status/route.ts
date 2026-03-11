import { NextResponse } from "next/server";
import { SimDB } from "@/lib/db/repository";

const db = new SimDB();

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export async function GET() {
  try {
    const heartbeat = await db.getDaemonHeartbeat();

    if (!heartbeat) {
      return NextResponse.json({ alive: false, phase: null, lastPing: null, version: null });
    }

    const lastPingMs = new Date(heartbeat.last_ping).getTime();
    const alive = Date.now() - lastPingMs < STALE_THRESHOLD_MS;

    return NextResponse.json({
      alive,
      phase: heartbeat.phase,
      lastPing: heartbeat.last_ping,
      version: heartbeat.version,
    });
  } catch (e) {
    return NextResponse.json({ alive: false, phase: null, lastPing: null, version: null });
  }
}
