export const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agents (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  initial_cash    NUMERIC NOT NULL DEFAULT 100000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS agent_state (
  agent_id        INT PRIMARY KEY REFERENCES agents(id),
  cash            NUMERIC NOT NULL,
  portfolio_value NUMERIC NOT NULL,
  total_pnl       NUMERIC NOT NULL DEFAULT 0,
  last_run_date   DATE,
  run_count       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
  id              SERIAL PRIMARY KEY,
  agent_id        INT NOT NULL REFERENCES agents(id),
  ticker          TEXT NOT NULL,
  shares          NUMERIC NOT NULL,
  entry_price     NUMERIC NOT NULL,
  entry_date      DATE NOT NULL,
  trailing_high   NUMERIC NOT NULL,
  cost_basis      NUMERIC NOT NULL,
  UNIQUE(agent_id, ticker)
);

CREATE TABLE IF NOT EXISTS trades (
  id              SERIAL PRIMARY KEY,
  agent_id        INT NOT NULL REFERENCES agents(id),
  date            DATE NOT NULL,
  ticker          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares          NUMERIC NOT NULL,
  price           NUMERIC NOT NULL,
  value           NUMERIC NOT NULL,
  commission      NUMERIC NOT NULL,
  cash_after      NUMERIC NOT NULL,
  reason          TEXT NOT NULL,
  llm_rationale   TEXT,
  signal_score    NUMERIC,
  phase           TEXT NOT NULL DEFAULT 'marketOpen'
);
CREATE INDEX IF NOT EXISTS idx_trades_agent_date ON trades(agent_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_idempotent ON trades(agent_id, date, phase, ticker, side);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id                SERIAL PRIMARY KEY,
  agent_id          INT NOT NULL REFERENCES agents(id),
  date              DATE NOT NULL,
  portfolio_value   NUMERIC NOT NULL,
  cash              NUMERIC NOT NULL,
  position_value    NUMERIC NOT NULL,
  num_positions     INT NOT NULL,
  daily_return      NUMERIC,
  cumulative_return NUMERIC,
  UNIQUE(agent_id, date)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_agent_date ON daily_snapshots(agent_id, date);

CREATE TABLE IF NOT EXISTS agent_memories (
  id              SERIAL PRIMARY KEY,
  agent_id        INT NOT NULL REFERENCES agents(id),
  content         TEXT NOT NULL,
  embedding       vector(1536),
  memory_type     TEXT NOT NULL DEFAULT 'daily_review',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_id);

CREATE TABLE IF NOT EXISTS phase_log (
  id              SERIAL PRIMARY KEY,
  phase           TEXT NOT NULL,
  date            DATE NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  agents_run      INT DEFAULT 0,
  last_agent_id   INT,
  notes           TEXT,
  UNIQUE(phase, date)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id              SERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  alert_type      TEXT NOT NULL CHECK (alert_type IN ('spike_up', 'spike_down', 'stop_breach')),
  pct_change      NUMERIC NOT NULL,
  price           NUMERIC NOT NULL,
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed       BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_alerts_pending ON price_alerts(processed, triggered_at);

CREATE TABLE IF NOT EXISTS evolution_log (
  id              SERIAL PRIMARY KEY,
  agent_id        INT NOT NULL REFERENCES agents(id),
  evolved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger         TEXT NOT NULL,
  field_changed   TEXT NOT NULL,
  old_hash        TEXT,
  new_hash        TEXT,
  cumulative_return_before NUMERIC,
  rationale       TEXT
);

CREATE TABLE IF NOT EXISTS daemon_heartbeat (
  id              INT PRIMARY KEY CHECK (id = 1),
  last_ping       TIMESTAMPTZ NOT NULL,
  phase           TEXT,
  version         TEXT
);

CREATE TABLE IF NOT EXISTS simulation_log (
  date            DATE PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  agents_processed INT NOT NULL DEFAULT 0,
  market_open     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS agent_docs (
  id              SERIAL PRIMARY KEY,
  agent_id        INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL,
  doc_date        DATE,
  content         TEXT NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_docs_unique ON agent_docs(agent_id, doc_type, COALESCE(doc_date, '0001-01-01'));
CREATE INDEX IF NOT EXISTS idx_agent_docs_agent ON agent_docs(agent_id, doc_type);
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runMigration(sql: (template: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>) {
  // Split on statement boundaries, filter blanks, execute each
  const statements = DDL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      const t = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
      await sql(t);
    } catch {
      // Ignore "already exists" errors on re-runs (IF NOT EXISTS handles most)
    }
  }
}
