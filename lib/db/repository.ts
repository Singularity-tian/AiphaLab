import { getDb } from "./client";

export interface AgentRow {
  id: number;
  name: string;
  initial_cash: number;
  created_at: string;
  is_active: boolean;
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
  phase: string;
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

export interface SimLogRow {
  date: string;
  started_at: string;
  finished_at: string | null;
  agents_processed: number;
  market_open: boolean;
}

export interface MemoryRow {
  id: number;
  agent_id: number;
  content: string;
  memory_type: string;
  created_at: string;
}

export interface PhaseLogRow {
  id: number;
  phase: string;
  date: string;
  started_at: string;
  finished_at: string | null;
  agents_run: number;
  last_agent_id: number | null;
  notes: string | null;
}

export interface PriceAlertRow {
  id: number;
  ticker: string;
  alert_type: "spike_up" | "spike_down" | "stop_breach";
  pct_change: number;
  price: number;
  triggered_at: string;
  processed: boolean;
}

export interface ResearchReportRow {
  id: number;
  ticker: string;
  status: "running" | "complete" | "failed";
  report_md: string | null;
  lenses_json: Record<string, string> | null;
  data_snapshot_json: unknown | null;
  error: string | null;
  created_at: string;
}

export interface ResearchReportListItem {
  id: number;
  ticker: string;
  status: string;
  report_head: string | null;
  created_at: string;
}

export interface PerformanceWindow {
  agentId: number;
  days: number;
  cumulativeReturn: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number | null;
  rank: number;
}

/** Coerce Postgres NUMERIC→number and DATE→string for Neon driver compatibility. */
function coerceRow<T>(row: any, numericFields: string[], dateFields: string[] = []): T {
  const out = { ...row };
  for (const f of numericFields) {
    if (out[f] != null) out[f] = Number(out[f]);
  }
  for (const f of dateFields) {
    if (out[f] instanceof Date) {
      out[f] = out[f].toISOString().slice(0, 10);
    }
  }
  return out as T;
}

const AGENT_NUM = ["initial_cash"];
const STATE_NUM = ["cash", "portfolio_value", "total_pnl"];
const POSITION_NUM = ["shares", "entry_price", "trailing_high", "cost_basis"];
const TRADE_NUM = ["shares", "price", "value", "commission", "cash_after", "signal_score"];
const SNAPSHOT_NUM = ["portfolio_value", "cash", "position_value", "daily_return", "cumulative_return"];

export class SimDB {
  // Cast to any[] return so rows[0] and rows.length work without index errors
  private sql = getDb() as unknown as (template: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>;

  // ---- agents ----
  async insertAgent(a: Omit<AgentRow, "id" | "created_at">): Promise<number> {
    const rows = await this.sql`
      INSERT INTO agents (name, initial_cash, is_active)
      VALUES (${a.name}, ${a.initial_cash}, ${a.is_active})
      RETURNING id
    `;
    return (rows[0] as { id: number }).id;
  }

  async getAllAgents(): Promise<AgentRow[]> {
    const rows = await this.sql`SELECT * FROM agents WHERE is_active = true ORDER BY id`;
    return (rows as any[]).map((r) => coerceRow<AgentRow>(r, AGENT_NUM));
  }

  async getAgent(id: number): Promise<AgentRow | null> {
    const rows = await this.sql`SELECT * FROM agents WHERE id = ${id}`;
    return rows[0] ? coerceRow<AgentRow>(rows[0], AGENT_NUM) : null;
  }

  async deleteAgent(id: number): Promise<void> {
    await this.sql`DELETE FROM agent_state WHERE agent_id = ${id}`;
    await this.sql`DELETE FROM agents WHERE id = ${id}`;
  }

  // ---- agent_state ----
  async upsertAgentState(s: AgentStateRow): Promise<void> {
    await this.sql`
      INSERT INTO agent_state (agent_id, cash, portfolio_value, total_pnl, last_run_date, run_count)
      VALUES (${s.agent_id}, ${s.cash}, ${s.portfolio_value}, ${s.total_pnl}, ${s.last_run_date}, ${s.run_count})
      ON CONFLICT (agent_id) DO UPDATE SET
        cash = EXCLUDED.cash,
        portfolio_value = EXCLUDED.portfolio_value,
        total_pnl = EXCLUDED.total_pnl,
        last_run_date = EXCLUDED.last_run_date,
        run_count = EXCLUDED.run_count
    `;
  }

  async updateAgentCash(agentId: number, cash: number): Promise<void> {
    await this.sql`UPDATE agent_state SET cash = ${cash} WHERE agent_id = ${agentId}`;
  }

  async getAgentState(agentId: number): Promise<AgentStateRow | null> {
    const rows = await this.sql`SELECT * FROM agent_state WHERE agent_id = ${agentId}`;
    return rows[0] ? coerceRow<AgentStateRow>(rows[0], STATE_NUM, ["last_run_date"]) : null;
  }

  // ---- positions ----
  async upsertPosition(p: Omit<PositionRow, "id">): Promise<void> {
    await this.sql`
      INSERT INTO positions (agent_id, ticker, shares, entry_price, entry_date, trailing_high, cost_basis)
      VALUES (${p.agent_id}, ${p.ticker}, ${p.shares}, ${p.entry_price}, ${p.entry_date}, ${p.trailing_high}, ${p.cost_basis})
      ON CONFLICT (agent_id, ticker) DO UPDATE SET
        shares = EXCLUDED.shares,
        entry_price = EXCLUDED.entry_price,
        entry_date = EXCLUDED.entry_date,
        trailing_high = EXCLUDED.trailing_high,
        cost_basis = EXCLUDED.cost_basis
    `;
  }

  async deletePosition(agentId: number, ticker: string): Promise<void> {
    await this.sql`DELETE FROM positions WHERE agent_id = ${agentId} AND ticker = ${ticker}`;
  }

  async getPositions(agentId: number): Promise<PositionRow[]> {
    const rows = await this.sql`SELECT * FROM positions WHERE agent_id = ${agentId}`;
    return (rows as any[]).map((r) => coerceRow<PositionRow>(r, POSITION_NUM, ["entry_date"]));
  }

  // ---- trades ----
  async insertTrade(t: Omit<TradeRow, "id">): Promise<number> {
    const rows = await this.sql`
      INSERT INTO trades (agent_id, date, ticker, side, shares, price, value, commission, cash_after, reason, llm_rationale, signal_score, phase)
      VALUES (${t.agent_id}, ${t.date}, ${t.ticker}, ${t.side}, ${t.shares}, ${t.price}, ${t.value}, ${t.commission}, ${t.cash_after}, ${t.reason}, ${t.llm_rationale}, ${t.signal_score}, ${t.phase})
      ON CONFLICT (agent_id, date, phase, ticker, side) DO NOTHING
      RETURNING id
    `;
    return (rows[0] as { id: number })?.id ?? 0;
  }

  async getTrades(agentId: number, limit = 100): Promise<TradeRow[]> {
    const rows = await this.sql`
      SELECT * FROM trades WHERE agent_id = ${agentId}
      ORDER BY date DESC, id DESC LIMIT ${limit}
    `;
    return (rows as any[]).map((r) => coerceRow<TradeRow>(r, TRADE_NUM, ["date"]));
  }

  async updateTradeCashAfter(tradeId: number, cashAfter: number): Promise<void> {
    await this.sql`UPDATE trades SET cash_after = ${cashAfter} WHERE id = ${tradeId}`;
  }

  async getTradesByDate(agentId: number, date: string): Promise<TradeRow[]> {
    const rows = await this.sql`
      SELECT * FROM trades WHERE agent_id = ${agentId} AND date = ${date}
    `;
    return (rows as any[]).map((r) => coerceRow<TradeRow>(r, TRADE_NUM, ["date"]));
  }

  // ---- daily_snapshots ----
  async insertSnapshot(s: Omit<SnapshotRow, "id">): Promise<void> {
    await this.sql`
      INSERT INTO daily_snapshots (agent_id, date, portfolio_value, cash, position_value, num_positions, daily_return, cumulative_return)
      VALUES (${s.agent_id}, ${s.date}, ${s.portfolio_value}, ${s.cash}, ${s.position_value}, ${s.num_positions}, ${s.daily_return}, ${s.cumulative_return})
      ON CONFLICT (agent_id, date) DO UPDATE SET
        portfolio_value = EXCLUDED.portfolio_value,
        cash = EXCLUDED.cash,
        position_value = EXCLUDED.position_value,
        num_positions = EXCLUDED.num_positions,
        daily_return = EXCLUDED.daily_return,
        cumulative_return = EXCLUDED.cumulative_return
    `;
  }

  async getSnapshots(agentId: number): Promise<SnapshotRow[]> {
    const rows = await this.sql`
      SELECT * FROM daily_snapshots WHERE agent_id = ${agentId} ORDER BY date ASC
    `;
    return (rows as any[]).map((r) => coerceRow<SnapshotRow>(r, SNAPSHOT_NUM, ["date"]));
  }

  async getLatestSnapshot(agentId: number): Promise<SnapshotRow | null> {
    const rows = await this.sql`
      SELECT * FROM daily_snapshots WHERE agent_id = ${agentId} ORDER BY date DESC LIMIT 1
    `;
    return rows[0] ? coerceRow<SnapshotRow>(rows[0], SNAPSHOT_NUM, ["date"]) : null;
  }

  async hasSnapshot(agentId: number, date: string): Promise<boolean> {
    const rows = await this.sql`
      SELECT 1 FROM daily_snapshots WHERE agent_id = ${agentId} AND date = ${date}
    `;
    return rows.length > 0;
  }

  // ---- leaderboard ----
  async getLeaderboard(limit = 100): Promise<Array<{
    id: number;
    name: string;
    portfolio_value: number;
    cumulative_return: number | null;
    daily_return: number | null;
    snap_date: string;
    trade_count: number;
    run_count: number;
  }>> {
    const rows = await this.sql`
      SELECT a.id, a.name,
             COALESCE(s.portfolio_value, st.portfolio_value, a.initial_cash) AS portfolio_value,
             s.cumulative_return, s.daily_return, s.date AS snap_date,
             COALESCE(st.run_count, 0)::int AS run_count,
             (SELECT COUNT(*) FROM trades WHERE agent_id = a.id)::int AS trade_count
      FROM agents a
      LEFT JOIN agent_state st ON st.agent_id = a.id
      LEFT JOIN (
        SELECT DISTINCT ON (agent_id) agent_id, portfolio_value, cumulative_return, daily_return, date
        FROM daily_snapshots
        ORDER BY agent_id, date DESC
      ) s ON a.id = s.agent_id
      WHERE a.is_active = true
      ORDER BY COALESCE(s.cumulative_return, 0) DESC NULLS LAST
      LIMIT ${limit}
    `;
    return (rows as any[]).map((r) => coerceRow(r, ["portfolio_value", "cumulative_return", "daily_return"], ["snap_date"]));
  }

  // ---- episodic memory ----
  async insertMemory(agentId: number, content: string, embedding: number[], memoryType = "daily_review"): Promise<void> {
    const embeddingStr = `[${embedding.join(",")}]`;
    await this.sql`
      INSERT INTO agent_memories (agent_id, content, embedding, memory_type)
      VALUES (${agentId}, ${content}, ${embeddingStr}::vector, ${memoryType})
    `;
  }

  async searchEpisodicMemory(agentId: number, queryEmbedding: number[], limit = 5): Promise<MemoryRow[]> {
    const embeddingStr = `[${queryEmbedding.join(",")}]`;
    const rows = await this.sql`
      SELECT id, agent_id, content, memory_type, created_at
      FROM agent_memories
      WHERE agent_id = ${agentId}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
    return rows as unknown as MemoryRow[];
  }

  // ---- phase_log ----
  async getPhaseLog(phase: string, date: string): Promise<PhaseLogRow | null> {
    const rows = await this.sql`
      SELECT * FROM phase_log WHERE phase = ${phase} AND date = ${date}
    `;
    return (rows[0] as unknown as PhaseLogRow) ?? null;
  }

  async insertPhaseLog(phase: string, date: string): Promise<void> {
    await this.sql`
      INSERT INTO phase_log (phase, date) VALUES (${phase}, ${date})
      ON CONFLICT (phase, date) DO NOTHING
    `;
  }

  async updatePhaseLogProgress(phase: string, date: string, lastAgentId: number): Promise<void> {
    await this.sql`
      UPDATE phase_log
      SET agents_run = agents_run + 1, last_agent_id = ${lastAgentId}
      WHERE phase = ${phase} AND date = ${date}
    `;
  }

  async finishPhaseLog(phase: string, date: string, totalAgents: number): Promise<void> {
    await this.sql`
      UPDATE phase_log
      SET finished_at = now(), agents_run = ${totalAgents}
      WHERE phase = ${phase} AND date = ${date}
    `;
  }

  // ---- daemon_heartbeat ----
  async upsertDaemonHeartbeat(phase: string, version: string): Promise<void> {
    await this.sql`
      INSERT INTO daemon_heartbeat (id, last_ping, phase, version)
      VALUES (1, now(), ${phase}, ${version})
      ON CONFLICT (id) DO UPDATE SET
        last_ping = now(),
        phase = EXCLUDED.phase,
        version = EXCLUDED.version
    `;
  }

  async getDaemonHeartbeat(): Promise<{ last_ping: string; phase: string | null; version: string | null } | null> {
    const rows = await this.sql`SELECT * FROM daemon_heartbeat WHERE id = 1`;
    return (rows[0] as unknown as any) ?? null;
  }

  // ---- price_alerts ----
  async insertPriceAlert(alert: Omit<PriceAlertRow, "id" | "triggered_at" | "processed">): Promise<void> {
    await this.sql`
      INSERT INTO price_alerts (ticker, alert_type, pct_change, price)
      VALUES (${alert.ticker}, ${alert.alert_type}, ${alert.pct_change}, ${alert.price})
    `;
  }

  async getPendingAlerts(): Promise<PriceAlertRow[]> {
    const rows = await this.sql`
      SELECT * FROM price_alerts WHERE processed = false ORDER BY triggered_at ASC
    `;
    return rows as unknown as PriceAlertRow[];
  }

  async markAlertProcessed(id: number): Promise<void> {
    await this.sql`UPDATE price_alerts SET processed = true WHERE id = ${id}`;
  }

  // ---- evolution_log ----
  async insertEvolutionLog(entry: {
    agentId: number;
    trigger: string;
    fieldChanged: string;
    oldHash: string | null;
    newHash: string | null;
    cumulativeReturnBefore: number | null;
    rationale: string | null;
  }): Promise<void> {
    await this.sql`
      INSERT INTO evolution_log (agent_id, trigger, field_changed, old_hash, new_hash, cumulative_return_before, rationale)
      VALUES (${entry.agentId}, ${entry.trigger}, ${entry.fieldChanged}, ${entry.oldHash}, ${entry.newHash}, ${entry.cumulativeReturnBefore}, ${entry.rationale})
    `;
  }

  // ---- performance window (for evolution engine) ----
  async getAgentPerformanceWindow(agentId: number, days: number): Promise<PerformanceWindow | null> {
    const rows = await this.sql`
      WITH snapshots AS (
        SELECT date, portfolio_value, daily_return, cumulative_return
        FROM daily_snapshots
        WHERE agent_id = ${agentId}
        ORDER BY date DESC
        LIMIT ${days}
      ),
      running AS (
        SELECT
          date,
          portfolio_value,
          daily_return,
          cumulative_return,
          MAX(portfolio_value) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS peak_value
        FROM snapshots
        ORDER BY date
      ),
      stats AS (
        SELECT
          COUNT(*) AS day_count,
          (SELECT cumulative_return FROM snapshots ORDER BY date DESC LIMIT 1) AS latest_cum_ret,
          AVG(daily_return) AS avg_daily,
          STDDEV(daily_return) AS stddev_daily,
          COALESCE(MAX((peak_value - portfolio_value) / NULLIF(peak_value, 0)), 0) AS max_drawdown
        FROM running
      ),
      trade_stats AS (
        SELECT
          COUNT(*) AS total_trades,
          COUNT(*) FILTER (WHERE sell_price > buy_price) AS wins
        FROM (
          SELECT
            sell_t.price AS sell_price,
            COALESCE(
              (SELECT b.price FROM trades b
               WHERE b.agent_id = sell_t.agent_id AND b.ticker = sell_t.ticker AND b.side = 'BUY'
               AND b.date <= sell_t.date ORDER BY b.date DESC, b.id DESC LIMIT 1),
              sell_t.price
            ) AS buy_price
          FROM trades sell_t
          WHERE sell_t.agent_id = ${agentId} AND sell_t.side = 'SELL'
          AND sell_t.date >= (CURRENT_DATE - ${days}::int)
        ) sub
      )
      SELECT
        s.day_count::int AS days,
        s.latest_cum_ret AS cumulative_return,
        s.max_drawdown AS max_drawdown,
        CASE WHEN ts.total_trades > 0 THEN ts.wins::float / ts.total_trades ELSE 0 END AS win_rate,
        ts.total_trades::int AS total_trades,
        CASE WHEN s.stddev_daily > 0 THEN (s.avg_daily / s.stddev_daily) * sqrt(252) ELSE NULL END AS sharpe_ratio
      FROM stats s, trade_stats ts
    `;

    if (!rows[0]) return null;
    const r = rows[0] as any;

    // rank = percentile among all agents by cumulative_return
    const rankRows = await this.sql`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE cumulative_return < ${r.cumulative_return}) AS below
      FROM (
        SELECT DISTINCT ON (agent_id) agent_id, cumulative_return
        FROM daily_snapshots
        ORDER BY agent_id, date DESC
      ) latest
    `;
    const { total, below } = rankRows[0] as any;
    const rank = total > 0 ? Math.round((below / total) * 100) : 50;

    return {
      agentId,
      days: r.days,
      cumulativeReturn: parseFloat(r.cumulative_return ?? 0),
      maxDrawdown: parseFloat(r.max_drawdown ?? 0),
      winRate: parseFloat(r.win_rate ?? 0),
      totalTrades: parseInt(r.total_trades ?? 0),
      sharpeRatio: r.sharpe_ratio != null ? parseFloat(r.sharpe_ratio) : null,
      rank,
    };
  }

  // ---- simulation_log ----
  async getSimLog(date: string): Promise<SimLogRow | null> {
    const rows = await this.sql`SELECT * FROM simulation_log WHERE date = ${date}`;
    return (rows[0] as unknown as SimLogRow) ?? null;
  }

  async getLastSimLog(): Promise<SimLogRow | null> {
    const rows = await this.sql`SELECT * FROM simulation_log ORDER BY date DESC LIMIT 1`;
    return (rows[0] as unknown as SimLogRow) ?? null;
  }

  async insertSimLog(l: SimLogRow): Promise<void> {
    await this.sql`
      INSERT INTO simulation_log (date, started_at, finished_at, agents_processed, market_open)
      VALUES (${l.date}, ${l.started_at}, ${l.finished_at}, ${l.agents_processed}, ${l.market_open})
      ON CONFLICT (date) DO NOTHING
    `;
  }

  async finishSimLog(date: string, agentsProcessed: number): Promise<void> {
    await this.sql`
      UPDATE simulation_log SET finished_at = now(), agents_processed = ${agentsProcessed}
      WHERE date = ${date}
    `;
  }

  // ---- agent_docs (PgFileStore backing) ----
  async upsertAgentDoc(agentId: number, docType: string, content: string, docDate?: string | null): Promise<void> {
    const d = docDate ?? null;
    await this.sql`
      INSERT INTO agent_docs (agent_id, doc_type, doc_date, content, updated_at)
      VALUES (${agentId}, ${docType}, ${d}, ${content}, now())
      ON CONFLICT (agent_id, doc_type, COALESCE(doc_date, '0001-01-01'))
      DO UPDATE SET content = EXCLUDED.content, updated_at = now()
    `;
  }

  async getAgentDoc(agentId: number, docType: string, docDate?: string | null): Promise<string | null> {
    const d = docDate ?? null;
    const rows = d
      ? await this.sql`SELECT content FROM agent_docs WHERE agent_id = ${agentId} AND doc_type = ${docType} AND doc_date = ${d}`
      : await this.sql`SELECT content FROM agent_docs WHERE agent_id = ${agentId} AND doc_type = ${docType} AND doc_date IS NULL`;
    return (rows[0] as any)?.content ?? null;
  }

  async listAgentDocDates(agentId: number, docType: string): Promise<string[]> {
    const rows = await this.sql`
      SELECT doc_date FROM agent_docs
      WHERE agent_id = ${agentId} AND doc_type = ${docType} AND doc_date IS NOT NULL
      ORDER BY doc_date ASC
    `;
    return (rows as any[]).map((r) => String(r.doc_date).substring(0, 10));
  }

  async getRecentAgentDocs(agentId: number, docType: string, count: number): Promise<string[]> {
    const rows = await this.sql`
      SELECT content FROM agent_docs
      WHERE agent_id = ${agentId} AND doc_type = ${docType} AND doc_date IS NOT NULL
      ORDER BY doc_date DESC
      LIMIT ${count}
    `;
    return (rows as any[]).map((r) => r.content).reverse();
  }

  // ---- research reports ----
  async createResearchReport(ticker: string): Promise<number> {
    const rows = await this.sql`
      INSERT INTO research_reports (ticker, status)
      VALUES (${ticker}, 'running')
      RETURNING id
    `;
    return (rows[0] as { id: number }).id;
  }

  async completeResearchReport(
    id: number,
    reportMd: string,
    lensesJson: Record<string, string>,
    dataSnapshot: unknown
  ): Promise<void> {
    await this.sql`
      UPDATE research_reports
      SET status = 'complete',
          report_md = ${reportMd},
          lenses_json = ${JSON.stringify(lensesJson)}::jsonb,
          data_snapshot_json = ${JSON.stringify(dataSnapshot)}::jsonb,
          error = NULL
      WHERE id = ${id}
    `;
  }

  async failResearchReport(id: number, error: string): Promise<void> {
    await this.sql`
      UPDATE research_reports SET status = 'failed', error = ${error} WHERE id = ${id}
    `;
  }

  async getResearchReport(id: number): Promise<ResearchReportRow | null> {
    const rows = await this.sql`SELECT * FROM research_reports WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const r = { ...rows[0] };
    if (r.created_at instanceof Date) r.created_at = r.created_at.toISOString();
    return r as ResearchReportRow;
  }

  async listResearchReports(ticker?: string, limit = 50): Promise<ResearchReportListItem[]> {
    const rows = ticker
      ? await this.sql`
          SELECT id, ticker, status, LEFT(report_md, 400) AS report_head, created_at
          FROM research_reports WHERE ticker = ${ticker}
          ORDER BY created_at DESC LIMIT ${limit}`
      : await this.sql`
          SELECT id, ticker, status, LEFT(report_md, 400) AS report_head, created_at
          FROM research_reports
          ORDER BY created_at DESC LIMIT ${limit}`;
    return (rows as any[]).map((r) => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })) as ResearchReportListItem[];
  }
}
