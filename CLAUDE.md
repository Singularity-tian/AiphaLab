# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AiphaLab is an open-source stock market simulation platform where 100 LLM-powered traders — each with a unique persona, strategy, and memory — compete in a continuous real-money-style simulation using live market data.

Each agent has a "soul" stored as files: `identity.md` (personality, quirks, risk tolerance), `strategy.md` (watchlist, entry/exit rules, changelog), `beliefs.json` (per-ticker thesis/sentiment), and a daily `journal/`. A long-running daemon runs six trading phases each market day. A weekly evolution engine has Claude rewrite underperforming agents' strategies based on their own journals and trade history. Agents also embed their journals into pgvector and retrieve relevant episodic memories when making decisions.

The Next.js dashboard is a **read-only** leaderboard/viewer. All writes happen in the daemon.

## Commands

```bash
# Local development (two terminals)
pnpm dev          # Next.js dashboard on :3000
pnpm daemon:dev   # daemon with hot reload (tsx --watch)

# Run a single daemon phase manually (skip the scheduler)
pnpm daemon -- --phase preMarket --date 2025-01-06
# phases: preMarket | marketOpen | midday | marketClose | afterHours | weeklyReview

# DB + seeding
pnpm migrate      # run schema migration against DATABASE_URL
pnpm seed -- --n 5   # generate 5 LLM traders + soul files

# Type checking / build
pnpm typecheck    # tsc --noEmit (no build output)
pnpm build        # Next.js production build
```

## Environment Variables

Copy `.env.local.example` → `.env.local`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `FMP_API_KEY` | yes | Financial Modeling Prep (market data) |
| `ANTHROPIC_API_KEY` | yes | Claude API (LLM generation) |
| `OPENAI_API_KEY` | no | Embeddings (text-embedding-3-small); falls back to zero vectors |
| `FILESTORE_BACKEND=pg` | prod only | Use `agent_docs` table instead of local files |

## Architecture

**Two-process model — one repo, shared `lib/`:**

```
pnpm dev    →  app/          Next.js App Router  (read-only dashboard, Vercel)
pnpm daemon →  daemon/       Long-running process (all DB writes, Railway)
               lib/          Shared: SimDB, FileStore, agent logic, FMP, LLM
               data/agents/  Soul files (local dev only; prod uses agent_docs table)
```

The two processes communicate **only through Neon Postgres** — no IPC, no shared disk in production.

## Key Modules

| File | Purpose |
|------|---------|
| `lib/db/repository.ts` | `SimDB` — all DB access. Methods are async; result type is cast to `any[]` via the `getDb()` cast so `rows[0]` works without TS errors |
| `lib/db/schema.ts` | Postgres DDL + `runMigration(sql)` |
| `lib/fileStore.ts` | `IFileStore` interface; `FileStore` (local fs) and `PgFileStore` (Neon `agent_docs`); `getFileStore()` factory switches on `FILESTORE_BACKEND` |
| `lib/agent.ts` | `TraderAgent` — three phases: `runDecisionPhase()`, `runReviewPhase()`, `respondToAlert()` |
| `lib/broker.ts` | `SimulatedBroker` — paper trading, trailing stop-loss, position tracking |
| `lib/llm.ts` | `generate()`, `generateStructured<T>()`, `generateStructuredWithRetry<T>()` — all use `claude-sonnet-4-6` |
| `lib/fmp.ts` | `FMPClient` — FMP API wrapper with TTL cache |
| `lib/signals.ts` | Graham value + momentum signal scoring (returns 0–1) |
| `lib/embeddings.ts` | `EmbeddingClient` — pgvector embeddings via OpenAI, zero-vector fallback |
| `daemon/rateLimiter.ts` | Token buckets: `fmpBucket` (280/min), `llmBucket` (40/min) |

## Daemon Phases

Scheduled by `daemon/scheduler.ts` using luxon (DST-safe ET timezone):

| Phase | Time ET | What it does |
|-------|---------|-------------|
| `preMarket` | 09:00 | Cache signals for all agent watchlists |
| `marketOpen` | 09:35 | `runDecisionPhase()` for all agents (buy/sell) |
| `midday` | 12:30 | Trailing stop-loss rescan |
| `marketClose` | 15:55 | EOD daily_snapshots |
| `afterHours` | 16:30 | `runReviewPhase()` → journal + pgvector memory |
| `weeklyReview` | Sun 20:00 | Evolution engine: LLM rewrites strategy.md for under/over-performers |

Price monitor runs every 5 min during market hours, detecting >3% intraday moves → `respondToAlert()`.

## Agent Soul Files

Each agent has a directory `data/agents/agent_NNN/` (local) or rows in `agent_docs` table (prod):

- `identity.md` — persona: name, background, personality traits, risk tolerance, quirks, parameters
- `strategy.md` — watchlist (30 tickers), entry/exit rules, position sizing, changelog
- `beliefs.json` — per-ticker sentiment/thesis/confidence, updated after each trade
- `journal/YYYY-MM-DD.md` — daily reflections written by `runReviewPhase()`

The evolution engine (Sunday) reads recent journals + performance metrics and rewrites `strategy.md` via LLM for agents classified as underperformers (return < -10%, rank < 50th) or overperformers (return > 15%, rank > 75th).

## Key Patterns

**FileStore:** Always use `getFileStore()` — never instantiate `FileStore` or `PgFileStore` directly (except in `scripts/seed.ts`). All daemon phases and `lib/agent.ts` accept `IFileStore`, not the concrete class.

**Database:** `SimDB` methods are async. The `sql` tagged-template result is cast to `Promise<any[]>` at the class level so `rows[0]` and `rows.length` work without TS index errors.

**Next.js API routes** in `app/api/` must be **read-only** — no DB writes. All mutations go through the daemon.

**LLM calls** in the daemon must go through `llmBucket.waitForToken()` before calling `generate()` or `generateStructured()`.

## Deployment

| Service | Command | Env vars needed |
|---------|---------|----------------|
| Vercel (Next.js) | `pnpm build` auto | `DATABASE_URL`, `FILESTORE_BACKEND=pg`, `ANTHROPIC_API_KEY` |
| Railway (daemon) | `pnpm daemon` | all of the above + `FMP_API_KEY` |

Run migration once before first deploy: `DATABASE_URL=<neon_url> pnpm migrate`
