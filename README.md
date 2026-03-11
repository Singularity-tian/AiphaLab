# AiphaLab

An open-source stock market simulation platform where **100 AI traders** — each with a unique personality, strategy, and memory — compete against each other in real time.

Every agent has a "soul": an `identity.md` (who they are), a `strategy.md` (how they trade), a `beliefs.json` (per-ticker thesis), and a daily journal. A long-running daemon executes six trading phases each market day, and a weekly evolution engine uses Claude to rewrite underperforming agents' strategies based on their own journals and performance history.

## What makes it interesting

- **Distinct personas** — agents range from cautious finance professors to reckless fintwit momentum chasers, each with cognitive biases baked into their LLM prompts
- **Evolving strategies** — every Sunday, the bottom and top performers have their `strategy.md` rewritten by Claude, guided by their own trade history and journal reflections
- **Episodic memory** — agents embed their daily journals into pgvector and retrieve relevant past experiences when making decisions
- **Real market data** — prices, signals, and market regime from Financial Modeling Prep API
- **Live leaderboard** — a read-only Next.js dashboard shows rankings, equity curves, open positions, and daily mood

## Architecture

Two processes, one repo:

```
pnpm dev          →  Next.js dashboard (read-only, Vercel)
pnpm daemon       →  Trading engine (all writes, Railway)
                     shared lib/ ← SimDB, FileStore, agent logic
```

The dashboard and daemon communicate only through **Neon Postgres** — no shared disk in production. Agent soul files are stored in `data/agents/agent_NNN/` locally and in the `agent_docs` table in production (`FILESTORE_BACKEND=pg`).

## Quick start

```bash
# 1. Install
pnpm install

# 2. Set up environment
cp .env.local.example .env.local
# Fill in DATABASE_URL, FMP_API_KEY, ANTHROPIC_API_KEY

# 3. Run DB migration
pnpm migrate

# 4. Seed traders
pnpm seed -- --n 10

# 5. Start both processes
pnpm dev          # terminal 1 — dashboard at localhost:3000
pnpm daemon:dev   # terminal 2 — trading engine
```

Or run a single historical day manually:
```bash
pnpm daemon -- --phase marketOpen --date 2025-01-06
```

## Daemon phases

| Phase | Time (ET) | What happens |
|-------|-----------|-------------|
| preMarket | 09:00 | Signal cache for all watchlists |
| marketOpen | 09:35 | LLM buy/sell decisions for all agents |
| midday | 12:30 | Trailing stop-loss rescan |
| marketClose | 15:55 | EOD portfolio snapshots |
| afterHours | 16:30 | Daily journal + pgvector memory embedding |
| weeklyReview | Sun 20:00 | Evolution engine: strategy rewrites |

## Tech stack

- **Claude** (`claude-sonnet-4-6`) — trading decisions, journals, strategy evolution
- **Neon Postgres** + **pgvector** — data store + episodic memory
- **Next.js 16** — read-only dashboard
- **Financial Modeling Prep** — market data
- **Railway** (daemon) + **Vercel** (dashboard) — deployment

## Deploy

```bash
# Vercel — connect repo, set env vars, auto-deploys Next.js
# Railway — connect repo, set start command to: pnpm daemon
# Both need: DATABASE_URL, ANTHROPIC_API_KEY, FMP_API_KEY, FILESTORE_BACKEND=pg
pnpm migrate   # run once against your Neon DB before first deploy
```
