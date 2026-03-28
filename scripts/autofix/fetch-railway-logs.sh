#!/usr/bin/env bash
set -euo pipefail

# Fetch Railway production logs for the daemon service.
# Outputs: /tmp/railway-logs.json (newline-delimited JSON)
#
# Required env vars (injected by GitHub Actions):
#   RAILWAY_TOKEN            — Railway API token
#   RAILWAY_PROJECT_ID       — Railway project UUID
#   RAILWAY_ENVIRONMENT_ID   — Railway environment UUID (production)
#   RAILWAY_SERVICE_ID       — Railway daemon service UUID
#   LOOKBACK                 — How far back to fetch (default: 24h)

: "${RAILWAY_TOKEN:?Missing RAILWAY_TOKEN}"
: "${RAILWAY_PROJECT_ID:?Missing RAILWAY_PROJECT_ID}"
: "${RAILWAY_ENVIRONMENT_ID:?Missing RAILWAY_ENVIRONMENT_ID}"
: "${RAILWAY_SERVICE_ID:?Missing RAILWAY_SERVICE_ID}"

LOOKBACK="${LOOKBACK:-24h}"

echo "[fetch-logs] Fetching daemon logs (last ${LOOKBACK})..."

railway logs \
  --project "$RAILWAY_PROJECT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --environment "$RAILWAY_ENVIRONMENT_ID" \
  --since "$LOOKBACK" \
  --lines 2000 \
  --json \
  > /tmp/railway-logs.json 2>/dev/null || true

LINE_COUNT=$(wc -l < /tmp/railway-logs.json 2>/dev/null || echo 0)
echo "[fetch-logs] Fetched ${LINE_COUNT} log lines."
