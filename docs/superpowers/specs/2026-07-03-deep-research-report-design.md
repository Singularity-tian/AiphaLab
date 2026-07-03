# Deep-Dive Research Report — Design

**Date:** 2026-07-03
**Status:** Approved (design review with owner)

## Purpose

One click turns a ticker into a beginner-readable research report written by four LLM "specialist lenses" analyzing the fundamental data the stock analyzer already fetches. Reports persist so the owner can re-read them, compare over time, and learn.

This is the first increment of a larger pipeline: **discover (screener) → understand (this feature) → challenge (red-team panel) → test (strategy sandbox) → monitor (watchlist)**. Those later stages are out of scope here but the interfaces should not preclude them.

## Explicitly educational, not advisory

- Every report ends with a fixed footer: educational tool, not financial advice; LLMs make mistakes; verify numbers independently.
- Lens prompts instruct the model to reason **only from the provided data bundle**, never from its own memory of the company. This is the primary hallucination control: every figure cited in a report must come from the snapshot.
- No "buy/sell" recommendation output anywhere. The synthesis ends with "what would need to be true to justify owning this," which frames a research question, not advice.

## Non-goals

- No price prediction, trading signals, or automated execution.
- No multi-model (cross-family) panel in this increment — but the lens config makes it a config change later.
- No screener, watchlist, or thesis red-teaming (future increments).

## The research panel

All lenses run on the already-wired Azure OpenAI client (`lib/llm.ts`). Verified 2026-07-03: the resource serves `gpt-5.4` (`gpt-5.4-2026-03-05`); no `gpt-5.5` deployment exists. Default model: `gpt-5.4`.

Each lens is a config object `{ key, title, model, systemPrompt }` in `lib/research/lenses.ts`:

| Lens | Question it answers |
|---|---|
| `business` — Business Analyst | What does this company do, how does it make money, does it have a moat? Plain language. |
| `forensic` — Forensic Accountant | Is the balance sheet / cash-flow healthy? Red flags in the numbers (debt load, negative equity, buybacks vs FCF, receivables growth vs revenue)? |
| `valuation` — Valuation Analyst | Is the price sane vs peers and history? What growth expectations are priced in? |
| `bear` — Short Seller | The strongest honest bear case. What kills this company? |

The 4 lens calls run in parallel. A 5th **synthesis** call receives all lens outputs and produces the final report in markdown with this exact section order:

1. TL;DR (5 bullets max)
2. The Business
3. Financial Health
4. Valuation
5. Bull Case / Bear Case (side by side)
6. Red Flags
7. What Would Need to Be True (to justify owning it)
8. Glossary (every finance term used, one-line beginner definitions)
9. Fixed disclaimer footer

## Data bundle

Extract the current inline fetch in `app/api/stock/route.ts` into `lib/stockData.ts` exposing `getStockBundle(ticker)` returning the existing 13 sections. Both `/api/stock` and report generation use it (no duplication, same caching).

Report generation additionally fetches `getFundamentalsTTM` for the top 4 peers (~4 extra FMP calls, all cached 24h) so the valuation lens has real comparables.

The full bundle (including peer fundamentals) is serialized into each lens prompt as structured JSON, and persisted with the report as `data_snapshot_json` — every report permanently shows what the numbers were when it was written.

## Architecture & data flow

```
StockAnalyzer "Deep Research" button (or /research page)
  → POST /api/research {ticker}
      validates ticker (same regex as /api/stock), rate-limits,
      inserts research_reports row (status='running'), returns {id},
      starts generation without awaiting it
  → generation: getStockBundle + peer fundamentals
      → 4 lens calls in parallel → synthesis call
      → UPDATE row: status='complete', report_md, lenses_json
  → client polls GET /api/research/[id] every ~3s until status != 'running'
```

Polling matches the repo's existing pull-based pattern (leaderboard, daemon status). Generation runs in the Next.js API process (fire-and-forget promise after responding); expected wall time ~60–90 s.

Serverless caveat: on Vercel, work after the response returns may be killed. Acceptable for now because the primary environment is local/dev; if reports are needed in production the generation moves to the daemon (a `research_requests` poll) without changing the API contract. Record this in code comments.

## Data model

New table `research_reports`:

| column | type | notes |
|---|---|---|
| `id` | SERIAL PK | |
| `ticker` | TEXT NOT NULL | uppercase, validated |
| `status` | TEXT NOT NULL | `running` \| `complete` \| `failed` |
| `report_md` | TEXT | final synthesized markdown |
| `lenses_json` | JSONB | raw per-lens outputs `{business, forensic, valuation, bear}` |
| `data_snapshot_json` | JSONB | full data bundle used |
| `error` | TEXT | failure reason when status='failed' |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

Added to `lib/db/schema.ts` (idempotent `CREATE TABLE IF NOT EXISTS`, applied by `pnpm migrate`). Access methods on `SimDB`: `createResearchReport`, `updateResearchReport`, `getResearchReport`, `listResearchReports`.

## API

- `POST /api/research` — body `{ticker}`. Validates (regex `^[A-Z0-9.\-]{1,10}$`), rate-limits (max 5 reports/hour globally — reports cost ~5–6 LLM calls each), verifies quote exists (cheap cached `getQuote`; unknown ticker → 404 before any row insert). Returns `{id}` (201).
- `GET /api/research/[id]` — returns full row. 404 if absent.
- `GET /api/research?ticker=X` (optional list filter) — returns recent reports metadata (no snapshots) for the library page.

## UI

- **StockAnalyzer card**: after data loads, a `Deep Research` button. Clicking POSTs, then shows inline progress ("Research panel analyzing… ~1 min") polling until done, then a link "View report →" to `/research/[id]`. If a report for the ticker exists (from the list endpoint), also show "Last report: <date> →".
- **`/research`** (server component, mirrors `/traders` patterns): list of reports — ticker, date, status, first TL;DR line. Links to detail.
- **`/research/[id]`** (server component): renders `report_md` (markdown → HTML), collapsible raw lens outputs, collapsible data snapshot, disclaimer visible.
- Styling follows the existing dashboard idiom (dark, `#111113` cards, `#c8f542` accent, DM Mono / Instrument Serif).

Markdown rendering: use `react-markdown` (small, no plugins needed) — the one new dependency.

## Guardrails

- Report generation cap: 5/hour (global fixed-window counter, same in-memory pattern as `/api/stock`'s limiter).
- LLM output length: lenses capped ~1,200 tokens each, synthesis ~3,000 (raise `max_completion_tokens` via existing `generate()` param — requires exposing it; currently hardcoded 1024, extend signature with optional `maxTokens`).
- Prompt-side rule: "If a data field is null or missing, say 'not available' — do not estimate or recall values."

## Error handling

- Any single lens failure → synthesis proceeds with remaining lenses and notes the gap in the report ("Valuation lens unavailable for this run").
- Synthesis failure or all-lens failure → `status='failed'`, `error` stored; detail page and analyzer show the error with a "Retry" button (new POST).
- Process death mid-run → row stuck in `running`; the GET endpoint reports rows older than 10 minutes still `running` as `failed (timed out)` — computed at read time, no reaper job needed.

## Testing / verification

1. `pnpm typecheck` and `pnpm build` pass.
2. `pnpm migrate` creates the table.
3. End-to-end in browser: generate a report for 1–2 real tickers; verify progress → completion, markdown renders, figures cited in the report match `data_snapshot_json`, glossary and disclaimer present.
4. Failure path: request with an invalid ticker (400), unknown ticker (404), and a 6th report within the hour (429).

## Future extensions (documented, not built)

- Per-lens cross-family models (Anthropic/Google keys or a gateway) — change lens `model` fields.
- Red-team thesis panel — reuses lens machinery with a user-supplied thesis as input.
- Screener → auto-research top hits; watchlist monitoring that re-runs reports on material changes and diffs them against prior snapshots.

## Disclaimer footer (fixed text)

> This report was generated by AI from public financial data for educational purposes only. It is not financial advice. Language models make mistakes — verify all figures independently before making any investment decision.

---

## Addendum — 2026-07-03 (v2, owner-directed)

Two changes after the initial release, both explicitly requested by the owner:

1. **Generation moved to the daemon.** `POST /api/research` now only inserts the
   `running` row; `daemon/researchWorker.ts` polls every ~10s for unprocessed rows
   (`status='running' AND report_md IS NULL AND error IS NULL`) and runs the panel
   with every LLM call gated through `llmBucket`. This removes the serverless
   limitation, resumes orphaned rows on daemon restart, and satisfies the repo's
   daemon-side rate-limiting rule. Local dev requires the standard two terminals.

2. **Opinionated persona replaces neutral analysis.** The owner explicitly wants
   subjective views and actionable suggestions ("agents to help me decide"), not
   both-sides analysis. The "never give buy/sell/hold recommendations" rule is
   REMOVED by owner decision. Lenses are now stance-taking specialists; synthesis
   is a lead-PM memo with new section skeleton: The Call (with Conviction X/10) →
   What This Company Actually Is → The Numbers That Matter → Bull vs Bear — Who
   Wins → Red Flags → What I'd Do (stance + conditions, levels anchored to data
   figures only) → What Would Change My Mind → Glossary. The data-only rule and
   the disclaimer footer are unchanged.
