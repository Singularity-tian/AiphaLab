#!/usr/bin/env node

/**
 * build-prompt.mjs
 *
 * Reads  /tmp/autofix-errors.json  (from extract-errors.mjs).
 * Writes /tmp/autofix-prompt.md    (prompt for Claude Code Action).
 *
 * If there are no errors the output file is empty, which signals the
 * workflow to skip the Claude Code step.
 */

import { readFileSync, writeFileSync } from "node:fs";

const errors = JSON.parse(readFileSync("/tmp/autofix-errors.json", "utf-8"));

if (errors.length === 0) {
  writeFileSync("/tmp/autofix-prompt.md", "");
  console.log("[build-prompt] No errors to fix. Empty prompt.");
  process.exit(0);
}

// ── Build the error list section ─────────────────────────────────────

const errorSection = errors
  .map(
    (e, i) =>
      `### Error ${i + 1} — ${e.priority} (${e.count}x in 24 h)
\`\`\`
${e.message}
\`\`\`
Signature: \`${e.signature}\`
Last seen: ${e.lastSeen || "unknown"}`
  )
  .join("\n\n");

// ── Assemble the full prompt ─────────────────────────────────────────

const prompt = `# AutoFix: Production Error Report

## Context

AiphaLab is a stock-market simulation where LLM-powered traders run through
scheduled market phases on a daemon process deployed to Railway.

Key source-file map (error log tags → files):

| Log tag | Source file |
|---------|------------|
| \`[agent …]\` | \`lib/agent.ts\` |
| \`[marketOpen]\` | \`daemon/phases/marketOpen.ts\` |
| \`[marketClose]\` | \`daemon/phases/marketClose.ts\` |
| \`[midday]\` | \`daemon/phases/midday.ts\` |
| \`[afterHours]\` | \`daemon/phases/afterHours.ts\` |
| \`[preMarket]\` | \`daemon/phases/preMarket.ts\` |
| \`[scheduler]\` | \`daemon/scheduler.ts\` |
| \`[priceMonitor]\` | \`daemon/priceMonitor.ts\` |
| \`[evolution]\` | \`daemon/evolutionEngine.ts\` |
| JSON parse / Zod errors | \`lib/llm.ts\` or calling code |

Other important shared modules:
- \`lib/db/repository.ts\` — \`SimDB\`, main DB access layer
- \`lib/broker.ts\` — \`SimulatedBroker\` paper-trading engine
- \`lib/fileStore.ts\` — \`getFileStore()\` for soul doc access
- \`lib/signals.ts\` — deterministic value + momentum signals
- \`lib/fmp.ts\` — FMP API wrapper with caching

## Errors Found in Last 24 h

${errorSection}

## Instructions

1. **Investigate** each error — read the source files mentioned in the log
   tags or stack traces. Trace the data flow to find the root cause.

2. **Fix the root cause** with a minimal, targeted change. Add proper error
   handling (null checks, try-catch, input validation) where needed.

3. **Preserve existing patterns**:
   - Use \`pnpm\` (not npm)
   - LLM calls go through \`lib/llm.ts\` (\`@anthropic-ai/foundry-sdk\`)
   - Rate limiting via \`llmBucket.waitForToken()\` and \`fmpBucket\`
   - Database access via \`SimDB\` in \`lib/db/repository.ts\`
   - File storage via \`getFileStore()\` in \`lib/fileStore.ts\`

4. **Verify** your changes compile: run \`pnpm typecheck\`.

5. **Do NOT modify** any of these:
   - \`CLAUDE.md\`, \`.claude/settings.json\`
   - \`package.json\`, \`pnpm-lock.yaml\`
   - \`.env*\` files
   - \`.github/workflows/*\`
   - \`scripts/autofix/*\`
   - Database migration files

6. **Do NOT** add new dependencies, change database schema, or alter public
   API contracts (request/response shapes).

7. If a fix requires an environment variable change or a database migration,
   add a \`// TODO(autofix): …\` comment explaining what is needed and STOP.

8. If you cannot determine the root cause with high confidence, STOP and
   explain why in a comment rather than guessing.
`;

writeFileSync("/tmp/autofix-prompt.md", prompt);
console.log(
  `[build-prompt] Prompt written with ${errors.length} error(s).`
);
