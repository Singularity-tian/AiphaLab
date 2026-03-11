export const DDL = `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  persona_json TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  initial_cash REAL NOT NULL DEFAULT 100000,
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agent_state (
  agent_id INTEGER PRIMARY KEY REFERENCES agents(id),
  cash REAL NOT NULL,
  portfolio_value REAL NOT NULL,
  total_pnl REAL NOT NULL DEFAULT 0,
  last_run_date TEXT,
  run_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  ticker TEXT NOT NULL,
  shares REAL NOT NULL,
  entry_price REAL NOT NULL,
  entry_date TEXT NOT NULL,
  trailing_high REAL NOT NULL,
  cost_basis REAL NOT NULL,
  UNIQUE(agent_id, ticker)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  date TEXT NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  shares REAL NOT NULL,
  price REAL NOT NULL,
  value REAL NOT NULL,
  commission REAL NOT NULL,
  cash_after REAL NOT NULL,
  reason TEXT NOT NULL,
  llm_rationale TEXT,
  signal_score REAL
);
CREATE INDEX IF NOT EXISTS idx_trades ON trades(agent_id, date);

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  date TEXT NOT NULL,
  portfolio_value REAL NOT NULL,
  cash REAL NOT NULL,
  position_value REAL NOT NULL,
  num_positions INTEGER NOT NULL,
  daily_return REAL,
  cumulative_return REAL,
  UNIQUE(agent_id, date)
);
CREATE INDEX IF NOT EXISTS idx_snapshots ON daily_snapshots(agent_id, date);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  date TEXT NOT NULL,
  review_text TEXT NOT NULL,
  mood TEXT,
  UNIQUE(agent_id, date)
);

CREATE TABLE IF NOT EXISTS simulation_log (
  date TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  agents_processed INTEGER NOT NULL DEFAULT 0,
  market_open INTEGER NOT NULL DEFAULT 1
);
`;
