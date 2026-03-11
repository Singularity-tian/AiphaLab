import Database from "better-sqlite3";
import { getDb } from "./client";

export interface AgentRow {
  id: number;
  name: string;
  persona_json: string;
  strategy_name: string;
  initial_cash: number;
  created_at: string;
  is_active: number;
}

export interface AgentStateRow {
  agent_id: number;
  cash: number;
  portfolio_value: number;
  total_pnl: number;
  last_run_date: string | null;
  run_count: number;
}

export interface PositionRow {
  id: number;
  agent_id: number;
  ticker: string;
  shares: number;
  entry_price: number;
  entry_date: string;
  trailing_high: number;
  cost_basis: number;
}

export interface TradeRow {
  id: number;
  agent_id: number;
  date: string;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  value: number;
  commission: number;
  cash_after: number;
  reason: string;
  llm_rationale: string | null;
  signal_score: number | null;
}

export interface SnapshotRow {
  id: number;
  agent_id: number;
  date: string;
  portfolio_value: number;
  cash: number;
  position_value: number;
  num_positions: number;
  daily_return: number | null;
  cumulative_return: number | null;
}

export interface ReviewRow {
  id: number;
  agent_id: number;
  date: string;
  review_text: string;
  mood: string | null;
}

export interface SimLogRow {
  date: string;
  started_at: string;
  finished_at: string | null;
  agents_processed: number;
  market_open: number;
}

export class SimDB {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  // ---- agents ----
  insertAgent(a: Omit<AgentRow, "id">): number {
    const r = this.db
      .prepare(
        `INSERT INTO agents (name, persona_json, strategy_name, initial_cash, created_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(a.name, a.persona_json, a.strategy_name, a.initial_cash, a.created_at, a.is_active);
    return r.lastInsertRowid as number;
  }

  getAllAgents(): AgentRow[] {
    return this.db.prepare("SELECT * FROM agents WHERE is_active = 1").all() as AgentRow[];
  }

  getAgent(id: number): AgentRow | null {
    return (this.db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow) ?? null;
  }

  // ---- agent_state ----
  upsertAgentState(s: AgentStateRow) {
    this.db
      .prepare(
        `INSERT INTO agent_state (agent_id, cash, portfolio_value, total_pnl, last_run_date, run_count)
         VALUES (@agent_id, @cash, @portfolio_value, @total_pnl, @last_run_date, @run_count)
         ON CONFLICT(agent_id) DO UPDATE SET
           cash = excluded.cash,
           portfolio_value = excluded.portfolio_value,
           total_pnl = excluded.total_pnl,
           last_run_date = excluded.last_run_date,
           run_count = excluded.run_count`
      )
      .run(s);
  }

  getAgentState(agentId: number): AgentStateRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM agent_state WHERE agent_id = ?")
        .get(agentId) as AgentStateRow) ?? null
    );
  }

  // ---- positions ----
  upsertPosition(p: Omit<PositionRow, "id">) {
    this.db
      .prepare(
        `INSERT INTO positions (agent_id, ticker, shares, entry_price, entry_date, trailing_high, cost_basis)
         VALUES (@agent_id, @ticker, @shares, @entry_price, @entry_date, @trailing_high, @cost_basis)
         ON CONFLICT(agent_id, ticker) DO UPDATE SET
           shares = excluded.shares,
           entry_price = excluded.entry_price,
           entry_date = excluded.entry_date,
           trailing_high = excluded.trailing_high,
           cost_basis = excluded.cost_basis`
      )
      .run(p);
  }

  deletePosition(agentId: number, ticker: string) {
    this.db
      .prepare("DELETE FROM positions WHERE agent_id = ? AND ticker = ?")
      .run(agentId, ticker);
  }

  getPositions(agentId: number): PositionRow[] {
    return this.db
      .prepare("SELECT * FROM positions WHERE agent_id = ?")
      .all(agentId) as PositionRow[];
  }

  // ---- trades ----
  insertTrade(t: Omit<TradeRow, "id">): number {
    const r = this.db
      .prepare(
        `INSERT INTO trades (agent_id, date, ticker, side, shares, price, value, commission, cash_after, reason, llm_rationale, signal_score)
         VALUES (@agent_id, @date, @ticker, @side, @shares, @price, @value, @commission, @cash_after, @reason, @llm_rationale, @signal_score)`
      )
      .run(t);
    return r.lastInsertRowid as number;
  }

  getTrades(agentId: number, limit = 100): TradeRow[] {
    return this.db
      .prepare("SELECT * FROM trades WHERE agent_id = ? ORDER BY date DESC, id DESC LIMIT ?")
      .all(agentId, limit) as TradeRow[];
  }

  getTradesByDate(agentId: number, date: string): TradeRow[] {
    return this.db
      .prepare("SELECT * FROM trades WHERE agent_id = ? AND date = ?")
      .all(agentId, date) as TradeRow[];
  }

  // ---- daily_snapshots ----
  insertSnapshot(s: Omit<SnapshotRow, "id">) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO daily_snapshots
         (agent_id, date, portfolio_value, cash, position_value, num_positions, daily_return, cumulative_return)
         VALUES (@agent_id, @date, @portfolio_value, @cash, @position_value, @num_positions, @daily_return, @cumulative_return)`
      )
      .run(s);
  }

  getSnapshots(agentId: number): SnapshotRow[] {
    return this.db
      .prepare("SELECT * FROM daily_snapshots WHERE agent_id = ? ORDER BY date ASC")
      .all(agentId) as SnapshotRow[];
  }

  getLatestSnapshot(agentId: number): SnapshotRow | null {
    return (
      (this.db
        .prepare(
          "SELECT * FROM daily_snapshots WHERE agent_id = ? ORDER BY date DESC LIMIT 1"
        )
        .get(agentId) as SnapshotRow) ?? null
    );
  }

  hasSnapshot(agentId: number, date: string): boolean {
    const r = this.db
      .prepare("SELECT 1 FROM daily_snapshots WHERE agent_id = ? AND date = ?")
      .get(agentId, date);
    return !!r;
  }

  // ---- daily_reviews ----
  upsertReview(r: Omit<ReviewRow, "id">) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO daily_reviews (agent_id, date, review_text, mood)
         VALUES (@agent_id, @date, @review_text, @mood)`
      )
      .run(r);
  }

  getLatestReview(agentId: number): ReviewRow | null {
    return (
      (this.db
        .prepare(
          "SELECT * FROM daily_reviews WHERE agent_id = ? ORDER BY date DESC LIMIT 1"
        )
        .get(agentId) as ReviewRow) ?? null
    );
  }

  // ---- leaderboard ----
  getLeaderboard(limit = 100): Array<AgentRow & SnapshotRow & { strategy_name: string }> {
    return this.db
      .prepare(
        `SELECT a.id, a.name, a.strategy_name, a.persona_json,
                s.portfolio_value, s.cumulative_return, s.daily_return, s.date as snap_date,
                (SELECT COUNT(*) FROM trades WHERE agent_id = a.id) as trade_count
         FROM agents a
         JOIN (
           SELECT agent_id, portfolio_value, cumulative_return, daily_return, date
           FROM daily_snapshots
           WHERE (agent_id, date) IN (
             SELECT agent_id, MAX(date) FROM daily_snapshots GROUP BY agent_id
           )
         ) s ON a.id = s.agent_id
         WHERE a.is_active = 1
         ORDER BY s.cumulative_return DESC NULLS LAST
         LIMIT ?`
      )
      .all(limit) as any[];
  }

  // ---- simulation_log ----
  getSimLog(date: string): SimLogRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM simulation_log WHERE date = ?")
        .get(date) as SimLogRow) ?? null
    );
  }

  getLastSimLog(): SimLogRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM simulation_log ORDER BY date DESC LIMIT 1")
        .get() as SimLogRow) ?? null
    );
  }

  insertSimLog(l: SimLogRow) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO simulation_log (date, started_at, finished_at, agents_processed, market_open)
         VALUES (@date, @started_at, @finished_at, @agents_processed, @market_open)`
      )
      .run(l);
  }

  finishSimLog(date: string, agentsProcessed: number) {
    this.db
      .prepare(
        "UPDATE simulation_log SET finished_at = ?, agents_processed = ? WHERE date = ?"
      )
      .run(new Date().toISOString(), agentsProcessed, date);
  }

  // ---- transactions ----
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
