#!/usr/bin/env node

/**
 * extract-errors.mjs
 *
 * Reads /tmp/railway-logs.json (newline-delimited JSON from Railway CLI --json).
 * Outputs /tmp/autofix-errors.json with deduplicated, classified errors.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ── Ignore patterns (transient / infra / not code bugs) ──────────────

const IGNORE_PATTERNS = [
  // Transient network errors (FMP API, Neon connection resets)
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /socket hang up/i,
  /UND_ERR_SOCKET/i,
  // Rate limiting (expected, handled by llmBucket / fmpBucket)
  /429 Too Many Requests/i,
  /rate.?limit/i,
  // Railway infrastructure
  /healthcheck/i,
  /gracefully/i,
  /SIGTERM/i,
  // Node.js deprecation warnings
  /ExperimentalWarning/i,
  /punycode/i,
  /DEP0\d+/i,
  // AbortError from cancelled fetches
  /AbortError/i,
  /ERR_CANCELED/i,
];

// ── Signature computation (normalise dynamic values) ─────────────────

function computeSignature(message) {
  const normalised = message
    .replace(/agent_?\d+|Agent\s+\d+/gi, "AGENT")
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, "DATE")
    .replace(/\b[0-9a-f]{8,}\b/gi, "HEX")
    .replace(/\b[0-9a-f-]{36}\b/gi, "UUID")
    .replace(/\d{10,}/g, "TS")
    .replace(/:\d+:\d+\)?/g, ":<L>:<C>)")
    .trim()
    .slice(0, 150);

  return createHash("md5").update(normalised).digest("hex").slice(0, 12);
}

// ── Main ─────────────────────────────────────────────────────────────

const raw = readFileSync("/tmp/railway-logs.json", "utf-8").trim();

if (!raw) {
  console.error("[extract-errors] Empty log file — nothing to process.");
  writeFileSync("/tmp/autofix-errors.json", "[]");
  process.exit(0);
}

const lines = raw.split("\n").filter(Boolean);
const errors = [];

for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }

  const msg = entry.message || entry.msg || "";
  const severity = (entry.severity || entry.level || "").toLowerCase();

  // Keep error/warn severity, or lines containing known error keywords
  const isError =
    severity === "error" ||
    severity === "fatal" ||
    /error|exception|fail|crash|unhandled/i.test(msg);
  if (!isError) continue;

  // Skip ignored patterns
  if (IGNORE_PATTERNS.some((p) => p.test(msg))) continue;

  errors.push({
    message: msg,
    severity,
    timestamp: entry.timestamp || entry.time || null,
  });
}

console.error(
  `[extract-errors] ${lines.length} log lines → ${errors.length} error lines after filtering`
);

// ── Deduplicate ──────────────────────────────────────────────────────

const groups = new Map();

for (const err of errors) {
  const sig = computeSignature(err.message);

  if (!groups.has(sig)) {
    groups.set(sig, {
      signature: sig,
      count: 0,
      message: err.message,
      severity: err.severity,
      firstSeen: err.timestamp,
      lastSeen: err.timestamp,
    });
  }

  const group = groups.get(sig);
  group.count++;
  if (err.timestamp) group.lastSeen = err.timestamp;
}

// ── Sort by frequency, cap at 5 ─────────────────────────────────────

const result = Array.from(groups.values())
  .map((g) => ({
    ...g,
    priority:
      g.count > 100
        ? "critical"
        : g.count > 30
          ? "high"
          : g.count > 5
            ? "medium"
            : "low",
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);

console.error(
  `[extract-errors] ${errors.length} errors → ${groups.size} unique → ${result.length} actionable`
);

writeFileSync("/tmp/autofix-errors.json", JSON.stringify(result, null, 2));
