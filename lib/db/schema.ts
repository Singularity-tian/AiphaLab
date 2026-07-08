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

CREATE TABLE IF NOT EXISTS research_reports (
  id              SERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',
  report_md       TEXT,
  lenses_json     JSONB,
  data_snapshot_json JSONB,
  error           TEXT,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_research_reports_ticker ON research_reports(ticker, created_at DESC);
ALTER TABLE research_reports ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS investment_theses (
  id              SERIAL PRIMARY KEY,
  mode            TEXT NOT NULL DEFAULT 'personal_desk',
  ticker          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('long', 'short', 'hedge')),
  horizon         TEXT NOT NULL,
  catalyst        TEXT NOT NULL,
  thesis          TEXT NOT NULL,
  invalidation    TEXT NOT NULL,
  confidence      NUMERIC NOT NULL,
  sources_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investment_theses_status ON investment_theses(status, ticker);

CREATE TABLE IF NOT EXISTS trade_proposals (
  id                SERIAL PRIMARY KEY,
  thesis_id         INT NOT NULL REFERENCES investment_theses(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL DEFAULT 'personal_desk',
  ticker            TEXT NOT NULL,
  instrument_type   TEXT NOT NULL CHECK (instrument_type IN ('equity', 'option')),
  direction         TEXT NOT NULL CHECK (direction IN ('long', 'short', 'hedge')),
  status            TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'blocked', 'ready', 'approved', 'rejected', 'deferred', 'filled', 'closed')),
  research_report_id INT REFERENCES research_reports(id) ON DELETE SET NULL,
  entry_price       NUMERIC NOT NULL,
  target_price      NUMERIC,
  stop_price        NUMERIC,
  quantity          NUMERIC NOT NULL,
  max_loss          NUMERIC NOT NULL,
  account_nav       NUMERIC NOT NULL DEFAULT 100000,
  rationale         TEXT NOT NULL,
  invalidation      TEXT NOT NULL,
  horizon           TEXT NOT NULL,
  option_strategy   TEXT,
  option_expiry     DATE,
  option_strikes_json JSONB,
  option_premium    NUMERIC,
  option_max_gain   NUMERIC,
  option_breakeven  NUMERIC,
  implied_vol_note  TEXT,
  liquidity_note    TEXT,
  order_ticket_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_status ON trade_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_proposals_ticker ON trade_proposals(ticker, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_reviews (
  id                       SERIAL PRIMARY KEY,
  proposal_id              INT NOT NULL UNIQUE REFERENCES trade_proposals(id) ON DELETE CASCADE,
  nav_risk_bps             NUMERIC NOT NULL,
  gross_exposure_delta_pct NUMERIC NOT NULL,
  net_exposure_delta_pct   NUMERIC NOT NULL,
  sector_exposure_note     TEXT NOT NULL,
  correlation_note         TEXT NOT NULL,
  scenario_loss            NUMERIC NOT NULL,
  verdict                  TEXT NOT NULL CHECK (verdict IN ('approved', 'blocked')),
  notes                    TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposal_decisions (
  id                SERIAL PRIMARY KEY,
  proposal_id       INT NOT NULL REFERENCES trade_proposals(id) ON DELETE CASCADE,
  decision          TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'deferred', 'edited')),
  reason            TEXT NOT NULL,
  edited_order_json JSONB,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_decisions_proposal ON proposal_decisions(proposal_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS manual_fills (
  id            SERIAL PRIMARY KEY,
  proposal_id   INT NOT NULL REFERENCES trade_proposals(id) ON DELETE CASCADE,
  broker        TEXT NOT NULL,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity      NUMERIC NOT NULL,
  price         NUMERIC NOT NULL,
  fees          NUMERIC NOT NULL DEFAULT 0,
  filled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_fills_proposal ON manual_fills(proposal_id, filled_at DESC);

CREATE TABLE IF NOT EXISTS proposal_postmortems (
  id               SERIAL PRIMARY KEY,
  proposal_id      INT NOT NULL UNIQUE REFERENCES trade_proposals(id) ON DELETE CASCADE,
  thesis_outcome   TEXT NOT NULL,
  process_score    INT NOT NULL CHECK (process_score BETWEEN 1 AND 10),
  pnl              NUMERIC,
  mistake_taxonomy TEXT NOT NULL,
  notes            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_profiles (
  id                       INT PRIMARY KEY CHECK (id = 1),
  base_currency            TEXT NOT NULL DEFAULT 'USD',
  monthly_income           NUMERIC NOT NULL DEFAULT 0,
  monthly_expenses         NUMERIC NOT NULL DEFAULT 0,
  emergency_months_target  NUMERIC NOT NULL DEFAULT 6,
  risk_tolerance           TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  max_drawdown_pct         NUMERIC NOT NULL DEFAULT 15,
  max_single_position_pct  NUMERIC NOT NULL DEFAULT 20,
  max_sector_pct           NUMERIC NOT NULL DEFAULT 35,
  goals_json               JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                    TEXT NOT NULL DEFAULT '',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id             SERIAL PRIMARY KEY,
  account        TEXT NOT NULL DEFAULT 'Taxable',
  asset_class    TEXT NOT NULL CHECK (asset_class IN ('cash', 'equity', 'etf', 'option', 'crypto', 'fund', 'other')),
  symbol         TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  sector         TEXT NOT NULL DEFAULT 'Unclassified',
  quantity       NUMERIC NOT NULL,
  cost_basis     NUMERIC,
  market_price   NUMERIC NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  liquidity      TEXT NOT NULL DEFAULT 'daily' CHECK (liquidity IN ('daily', 'weekly', 'locked', 'unknown')),
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_symbol ON portfolio_holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_asset_class ON portfolio_holdings(asset_class);

CREATE TABLE IF NOT EXISTS personal_budget_items (
  id              SERIAL PRIMARY KEY,
  item_type       TEXT NOT NULL CHECK (item_type IN ('income', 'expense', 'debt_payment', 'savings_goal')),
  category        TEXT NOT NULL DEFAULT 'General',
  label           TEXT NOT NULL,
  monthly_amount  NUMERIC NOT NULL,
  priority        INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_budget_type ON personal_budget_items(item_type, category);

CREATE TABLE IF NOT EXISTS cio_decision_logs (
  id            SERIAL PRIMARY KEY,
  question      TEXT NOT NULL,
  answer_md     TEXT NOT NULL,
  context_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
