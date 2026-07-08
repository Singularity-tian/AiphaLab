import { getDb } from "./client";
import {
  buildManualOrderTicket,
  buildRiskReview,
  canRecordDecision,
  canRecordManualFill,
  type DecisionInput,
  type DeskProposalInput,
  type DeskProposalPatch,
  type FillInput,
  type PostmortemInput,
  type ProposalStatus,
  type RiskReviewDraft,
} from "../desk";
import {
  DEFAULT_PROFILE_ID,
  buildPersonalDashboard,
  defaultProfile,
  type BudgetItem,
  type BudgetItemInput,
  type BudgetItemPatch,
  type Holding,
  type HoldingInput,
  type HoldingPatch,
  type PersonalDashboard,
  type PersonalProfile,
  type PersonalProfileInput,
} from "../personal";

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

export interface InvestmentThesisRow {
  id: number;
  mode: string;
  ticker: string;
  direction: "long" | "short" | "hedge";
  horizon: string;
  catalyst: string;
  thesis: string;
  invalidation: string;
  confidence: number;
  sources_json: string[];
  status: "active" | "paused" | "closed";
  created_at: string;
  updated_at: string;
}

export interface TradeProposalRow {
  id: number;
  thesis_id: number;
  mode: string;
  ticker: string;
  instrument_type: "equity" | "option";
  direction: "long" | "short" | "hedge";
  status: ProposalStatus;
  research_report_id: number | null;
  entry_price: number;
  target_price: number | null;
  stop_price: number | null;
  quantity: number;
  max_loss: number;
  account_nav: number;
  rationale: string;
  invalidation: string;
  horizon: string;
  option_strategy: string | null;
  option_expiry: string | null;
  option_strikes_json: number[] | null;
  option_premium: number | null;
  option_max_gain: number | null;
  option_breakeven: number | null;
  implied_vol_note: string | null;
  liquidity_note: string | null;
  order_ticket_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RiskReviewRow {
  id: number;
  proposal_id: number;
  nav_risk_bps: number;
  gross_exposure_delta_pct: number;
  net_exposure_delta_pct: number;
  sector_exposure_note: string;
  correlation_note: string;
  scenario_loss: number;
  verdict: "approved" | "blocked";
  notes: string;
  created_at: string;
}

export interface ProposalDecisionRow {
  id: number;
  proposal_id: number;
  decision: "approved" | "rejected" | "deferred" | "edited";
  reason: string;
  edited_order_json: Record<string, unknown> | null;
  decided_at: string;
}

export interface ManualFillRow {
  id: number;
  proposal_id: number;
  broker: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees: number;
  filled_at: string;
  notes: string | null;
  created_at: string;
}

export interface ProposalPostmortemRow {
  id: number;
  proposal_id: number;
  thesis_outcome: string;
  process_score: number;
  pnl: number | null;
  mistake_taxonomy: string;
  notes: string;
  created_at: string;
}

export interface DeskProposalDetail {
  proposal: TradeProposalRow;
  thesis: InvestmentThesisRow | null;
  riskReview: RiskReviewRow | null;
  decisions: ProposalDecisionRow[];
  fills: ManualFillRow[];
  postmortem: ProposalPostmortemRow | null;
}

export interface DeskDashboard {
  proposals: Array<TradeProposalRow & { nav_risk_bps: number | null; verdict: string | null }>;
  theses: InvestmentThesisRow[];
  recentDecisions: ProposalDecisionRow[];
  risk: {
    pendingCount: number;
    activeTheses: number;
    pendingRiskBps: number;
    approvedRiskBps: number;
    maxSingleRiskBps: number;
  };
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

function isoish(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function dateish(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function arrayJson(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function objectJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function coerceThesis(row: any): InvestmentThesisRow {
  const r = coerceRow<InvestmentThesisRow>(row, THESIS_NUM);
  return {
    ...r,
    sources_json: arrayJson(row.sources_json) as string[],
    created_at: isoish(row.created_at),
    updated_at: isoish(row.updated_at),
  };
}

function coerceProposal(row: any): TradeProposalRow {
  const r = coerceRow<TradeProposalRow>(row, PROPOSAL_NUM, ["option_expiry"]);
  return {
    ...r,
    option_expiry: row.option_expiry_text ?? dateish(row.option_expiry),
    option_strikes_json: row.option_strikes_json == null ? null : (arrayJson(row.option_strikes_json) as number[]),
    order_ticket_json: objectJson(row.order_ticket_json),
    created_at: isoish(row.created_at),
    updated_at: isoish(row.updated_at),
  };
}

function coerceRiskReview(row: any): RiskReviewRow {
  const r = coerceRow<RiskReviewRow>(row, RISK_NUM);
  return { ...r, created_at: isoish(row.created_at) };
}

function coerceDecision(row: any): ProposalDecisionRow {
  return {
    ...(row as ProposalDecisionRow),
    edited_order_json: row.edited_order_json == null ? null : objectJson(row.edited_order_json),
    decided_at: isoish(row.decided_at),
  };
}

function coerceFill(row: any): ManualFillRow {
  const r = coerceRow<ManualFillRow>(row, FILL_NUM);
  return { ...r, filled_at: isoish(row.filled_at), created_at: isoish(row.created_at) };
}

function coercePostmortem(row: any): ProposalPostmortemRow {
  const r = coerceRow<ProposalPostmortemRow>(row, POSTMORTEM_NUM);
  return { ...r, created_at: isoish(row.created_at) };
}

function coerceProfile(row: any): PersonalProfile {
  const r = coerceRow<PersonalProfile>(row, PROFILE_NUM);
  return {
    ...r,
    goals_json: arrayJson(row.goals_json) as string[],
    updated_at: isoish(row.updated_at),
  };
}

function coerceHolding(row: any): Holding {
  const r = coerceRow<Holding>(row, HOLDING_NUM);
  return {
    ...r,
    created_at: isoish(row.created_at),
    updated_at: isoish(row.updated_at),
  };
}

function coerceBudgetItem(row: any): BudgetItem {
  const r = coerceRow<BudgetItem>(row, BUDGET_NUM);
  return {
    ...r,
    created_at: isoish(row.created_at),
    updated_at: isoish(row.updated_at),
  };
}

const AGENT_NUM = ["initial_cash"];
const STATE_NUM = ["cash", "portfolio_value", "total_pnl"];
const POSITION_NUM = ["shares", "entry_price", "trailing_high", "cost_basis"];
const TRADE_NUM = ["shares", "price", "value", "commission", "cash_after", "signal_score"];
const SNAPSHOT_NUM = ["portfolio_value", "cash", "position_value", "daily_return", "cumulative_return"];
const THESIS_NUM = ["confidence"];
const PROPOSAL_NUM = [
  "entry_price",
  "target_price",
  "stop_price",
  "quantity",
  "max_loss",
  "account_nav",
  "option_premium",
  "option_max_gain",
  "option_breakeven",
];
const RISK_NUM = ["nav_risk_bps", "gross_exposure_delta_pct", "net_exposure_delta_pct", "scenario_loss"];
const FILL_NUM = ["quantity", "price", "fees"];
const POSTMORTEM_NUM = ["pnl"];
const PROFILE_NUM = [
  "monthly_income",
  "monthly_expenses",
  "emergency_months_target",
  "max_drawdown_pct",
  "max_single_position_pct",
  "max_sector_pct",
];
const HOLDING_NUM = ["quantity", "cost_basis", "market_price"];
const BUDGET_NUM = ["monthly_amount", "priority"];

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

  // ---- personal CIO context ----
  async getPersonalProfile(): Promise<PersonalProfile> {
    const rows = await this.sql`SELECT * FROM personal_profiles WHERE id = ${DEFAULT_PROFILE_ID}`;
    return rows[0] ? coerceProfile(rows[0]) : defaultProfile;
  }

  async upsertPersonalProfile(input: PersonalProfileInput): Promise<PersonalProfile> {
    const rows = await this.sql`
      INSERT INTO personal_profiles (
        id, base_currency, monthly_income, monthly_expenses, emergency_months_target,
        risk_tolerance, max_drawdown_pct, max_single_position_pct, max_sector_pct,
        goals_json, notes, updated_at
      )
      VALUES (
        ${DEFAULT_PROFILE_ID}, ${input.baseCurrency}, ${input.monthlyIncome}, ${input.monthlyExpenses},
        ${input.emergencyMonthsTarget}, ${input.riskTolerance}, ${input.maxDrawdownPct},
        ${input.maxSinglePositionPct}, ${input.maxSectorPct}, ${JSON.stringify(input.goals)}::jsonb,
        ${input.notes}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        base_currency = EXCLUDED.base_currency,
        monthly_income = EXCLUDED.monthly_income,
        monthly_expenses = EXCLUDED.monthly_expenses,
        emergency_months_target = EXCLUDED.emergency_months_target,
        risk_tolerance = EXCLUDED.risk_tolerance,
        max_drawdown_pct = EXCLUDED.max_drawdown_pct,
        max_single_position_pct = EXCLUDED.max_single_position_pct,
        max_sector_pct = EXCLUDED.max_sector_pct,
        goals_json = EXCLUDED.goals_json,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `;
    return coerceProfile(rows[0]);
  }

  async listHoldings(): Promise<Holding[]> {
    const rows = await this.sql`
      SELECT * FROM portfolio_holdings
      ORDER BY asset_class = 'cash' DESC, (quantity * market_price) DESC, symbol ASC
    `;
    return (rows as any[]).map(coerceHolding);
  }

  async createHolding(input: HoldingInput): Promise<Holding> {
    const rows = await this.sql`
      INSERT INTO portfolio_holdings (
        account, asset_class, symbol, name, sector, quantity, cost_basis, market_price,
        currency, liquidity, notes
      )
      VALUES (
        ${input.account}, ${input.assetClass}, ${input.symbol}, ${input.name}, ${input.sector},
        ${input.quantity}, ${input.costBasis ?? null}, ${input.marketPrice}, ${input.currency},
        ${input.liquidity}, ${input.notes}
      )
      RETURNING *
    `;
    return coerceHolding(rows[0]);
  }

  async updateHolding(id: number, patch: HoldingPatch): Promise<Holding> {
    const currentRows = await this.sql`SELECT * FROM portfolio_holdings WHERE id = ${id}`;
    if (!currentRows[0]) throw new Error("holding_not_found");
    const current = coerceHolding(currentRows[0]);
    const rows = await this.sql`
      UPDATE portfolio_holdings
      SET account = ${patch.account ?? current.account},
          asset_class = ${patch.assetClass ?? current.asset_class},
          symbol = ${patch.symbol ?? current.symbol},
          name = ${patch.name ?? current.name},
          sector = ${patch.sector ?? current.sector},
          quantity = ${patch.quantity ?? current.quantity},
          cost_basis = ${patch.costBasis ?? current.cost_basis},
          market_price = ${patch.marketPrice ?? current.market_price},
          currency = ${patch.currency ?? current.currency},
          liquidity = ${patch.liquidity ?? current.liquidity},
          notes = ${patch.notes ?? current.notes},
          updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return coerceHolding(rows[0]);
  }

  async deleteHolding(id: number): Promise<void> {
    await this.sql`DELETE FROM portfolio_holdings WHERE id = ${id}`;
  }

  async listBudgetItems(): Promise<BudgetItem[]> {
    const rows = await this.sql`
      SELECT * FROM personal_budget_items
      ORDER BY item_type, priority ASC, monthly_amount DESC, label ASC
    `;
    return (rows as any[]).map(coerceBudgetItem);
  }

  async createBudgetItem(input: BudgetItemInput): Promise<BudgetItem> {
    const rows = await this.sql`
      INSERT INTO personal_budget_items (item_type, category, label, monthly_amount, priority, notes)
      VALUES (${input.itemType}, ${input.category}, ${input.label}, ${input.monthlyAmount}, ${input.priority}, ${input.notes})
      RETURNING *
    `;
    return coerceBudgetItem(rows[0]);
  }

  async updateBudgetItem(id: number, patch: BudgetItemPatch): Promise<BudgetItem> {
    const currentRows = await this.sql`SELECT * FROM personal_budget_items WHERE id = ${id}`;
    if (!currentRows[0]) throw new Error("budget_item_not_found");
    const current = coerceBudgetItem(currentRows[0]);
    const rows = await this.sql`
      UPDATE personal_budget_items
      SET item_type = ${patch.itemType ?? current.item_type},
          category = ${patch.category ?? current.category},
          label = ${patch.label ?? current.label},
          monthly_amount = ${patch.monthlyAmount ?? current.monthly_amount},
          priority = ${patch.priority ?? current.priority},
          notes = ${patch.notes ?? current.notes},
          updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return coerceBudgetItem(rows[0]);
  }

  async deleteBudgetItem(id: number): Promise<void> {
    await this.sql`DELETE FROM personal_budget_items WHERE id = ${id}`;
  }

  async getPersonalDashboard(): Promise<PersonalDashboard> {
    const [profile, holdings, budgetItems] = await Promise.all([
      this.getPersonalProfile(),
      this.listHoldings(),
      this.listBudgetItems(),
    ]);
    return buildPersonalDashboard(profile, holdings, budgetItems);
  }

  async saveCioDecision(question: string, answerMd: string, context: unknown): Promise<void> {
    await this.sql`
      INSERT INTO cio_decision_logs (question, answer_md, context_json)
      VALUES (${question}, ${answerMd}, ${JSON.stringify(context)}::jsonb)
    `;
  }

  // ---- personal desk ----
  async createDeskProposal(input: DeskProposalInput): Promise<DeskProposalDetail> {
    const risk = buildRiskReview(input);
    const ticket = buildManualOrderTicket(input);
    const thesisRows = await this.sql`
      INSERT INTO investment_theses (
        mode, ticker, direction, horizon, catalyst, thesis, invalidation, confidence, sources_json, status
      )
      VALUES (
        'personal_desk', ${input.ticker}, ${input.direction}, ${input.horizon}, ${input.catalyst},
        ${input.thesis}, ${input.invalidation}, ${input.confidence}, ${JSON.stringify(input.sources)}::jsonb, 'active'
      )
      RETURNING *
    `;
    const thesis = coerceThesis(thesisRows[0]);
    const proposalRows = await this.sql`
      INSERT INTO trade_proposals (
        thesis_id, mode, ticker, instrument_type, direction, status, research_report_id,
        entry_price, target_price, stop_price, quantity, max_loss, account_nav, rationale,
        invalidation, horizon, option_strategy, option_expiry, option_strikes_json,
        option_premium, option_max_gain, option_breakeven, implied_vol_note, liquidity_note,
        order_ticket_json
      )
      VALUES (
        ${thesis.id}, 'personal_desk', ${input.ticker}, ${input.instrumentType}, ${input.direction},
        'ready', ${input.researchReportId ?? null}, ${input.entryPrice}, ${input.targetPrice ?? null},
        ${input.stopPrice ?? null}, ${input.quantity}, ${input.maxLoss}, ${input.accountNav},
        ${input.rationale}, ${input.invalidation}, ${input.horizon}, ${input.option?.strategy ?? null},
        ${input.option?.expiry ?? null}, ${input.option ? JSON.stringify(input.option.strikes) : null}::jsonb,
        ${input.option?.premium ?? null}, ${input.option?.maxGain ?? null}, ${input.option?.breakeven ?? null},
        ${input.option?.impliedVolNote ?? null}, ${input.option?.liquidityNote ?? null},
        ${JSON.stringify(ticket)}::jsonb
      )
      RETURNING *, option_expiry::text AS option_expiry_text
    `;
    const proposal = coerceProposal(proposalRows[0]);
    const riskReview = await this.insertRiskReview(proposal.id, risk);
    return { proposal, thesis, riskReview, decisions: [], fills: [], postmortem: null };
  }

  async updateDeskProposal(id: number, patch: DeskProposalPatch): Promise<DeskProposalDetail> {
    const current = await this.getDeskProposal(id);
    if (!current) throw new Error("proposal_not_found");
    if (["approved", "rejected", "filled", "closed"].includes(current.proposal.status)) {
      throw new Error(`cannot edit ${current.proposal.status} proposal`);
    }

    const merged: DeskProposalInput = {
      ticker: patch.ticker ?? current.proposal.ticker,
      direction: patch.direction ?? current.proposal.direction,
      horizon: patch.horizon ?? current.proposal.horizon,
      catalyst: patch.catalyst ?? current.thesis?.catalyst ?? "PM review",
      thesis: patch.thesis ?? current.thesis?.thesis ?? current.proposal.rationale,
      invalidation: patch.invalidation ?? current.proposal.invalidation,
      confidence: patch.confidence ?? current.thesis?.confidence ?? 0.6,
      sources: patch.sources ?? current.thesis?.sources_json ?? [],
      instrumentType: patch.instrumentType ?? current.proposal.instrument_type,
      entryPrice: patch.entryPrice ?? current.proposal.entry_price,
      targetPrice: patch.targetPrice ?? current.proposal.target_price ?? undefined,
      stopPrice: patch.stopPrice ?? current.proposal.stop_price ?? undefined,
      quantity: patch.quantity ?? current.proposal.quantity,
      maxLoss: patch.maxLoss ?? current.proposal.max_loss,
      accountNav: patch.accountNav ?? current.proposal.account_nav,
      rationale: patch.rationale ?? current.proposal.rationale,
      researchReportId: patch.researchReportId ?? current.proposal.research_report_id ?? undefined,
      option: patch.option ?? (current.proposal.instrument_type === "option" && current.proposal.option_strategy && current.proposal.option_expiry && current.proposal.option_premium && current.proposal.option_breakeven
        ? {
            strategy: current.proposal.option_strategy as any,
            expiry: current.proposal.option_expiry,
            strikes: current.proposal.option_strikes_json ?? [],
            premium: current.proposal.option_premium,
            maxGain: current.proposal.option_max_gain ?? undefined,
            breakeven: current.proposal.option_breakeven,
            impliedVolNote: current.proposal.implied_vol_note ?? "PM review",
            liquidityNote: current.proposal.liquidity_note ?? "PM review",
          }
        : undefined),
    };
    const risk = buildRiskReview(merged);
    const ticket = buildManualOrderTicket(merged);
    const nextStatus = patch.status && ["draft", "blocked", "ready", "deferred"].includes(patch.status)
      ? patch.status
      : "ready";

    await this.sql`
      UPDATE investment_theses
      SET ticker = ${merged.ticker},
          direction = ${merged.direction},
          horizon = ${merged.horizon},
          catalyst = ${merged.catalyst},
          thesis = ${merged.thesis},
          invalidation = ${merged.invalidation},
          confidence = ${merged.confidence},
          sources_json = ${JSON.stringify(merged.sources)}::jsonb,
          updated_at = now()
      WHERE id = ${current.proposal.thesis_id}
    `;
    await this.sql`
      UPDATE trade_proposals
      SET ticker = ${merged.ticker},
          instrument_type = ${merged.instrumentType},
          direction = ${merged.direction},
          status = ${nextStatus},
          research_report_id = ${merged.researchReportId ?? null},
          entry_price = ${merged.entryPrice},
          target_price = ${merged.targetPrice ?? null},
          stop_price = ${merged.stopPrice ?? null},
          quantity = ${merged.quantity},
          max_loss = ${merged.maxLoss},
          account_nav = ${merged.accountNav},
          rationale = ${merged.rationale},
          invalidation = ${merged.invalidation},
          horizon = ${merged.horizon},
          option_strategy = ${merged.option?.strategy ?? null},
          option_expiry = ${merged.option?.expiry ?? null},
          option_strikes_json = ${merged.option ? JSON.stringify(merged.option.strikes) : null}::jsonb,
          option_premium = ${merged.option?.premium ?? null},
          option_max_gain = ${merged.option?.maxGain ?? null},
          option_breakeven = ${merged.option?.breakeven ?? null},
          implied_vol_note = ${merged.option?.impliedVolNote ?? null},
          liquidity_note = ${merged.option?.liquidityNote ?? null},
          order_ticket_json = ${JSON.stringify(ticket)}::jsonb,
          updated_at = now()
      WHERE id = ${id}
    `;
    await this.upsertRiskReview(id, risk);
    const next = await this.getDeskProposal(id);
    if (!next) throw new Error("proposal_not_found");
    return next;
  }

  async listDeskProposals(limit = 50, status?: ProposalStatus): Promise<Array<TradeProposalRow & { nav_risk_bps: number | null; verdict: string | null }>> {
    const rows = status
      ? await this.sql`
          SELECT p.*, p.option_expiry::text AS option_expiry_text, r.nav_risk_bps, r.verdict
          FROM trade_proposals p
          LEFT JOIN risk_reviews r ON r.proposal_id = p.id
          WHERE p.mode = 'personal_desk' AND p.status = ${status}
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `
      : await this.sql`
          SELECT p.*, p.option_expiry::text AS option_expiry_text, r.nav_risk_bps, r.verdict
          FROM trade_proposals p
          LEFT JOIN risk_reviews r ON r.proposal_id = p.id
          WHERE p.mode = 'personal_desk'
          ORDER BY p.created_at DESC
          LIMIT ${limit}
        `;
    return (rows as any[]).map((row) => ({
      ...coerceProposal(row),
      nav_risk_bps: row.nav_risk_bps == null ? null : Number(row.nav_risk_bps),
      verdict: row.verdict ?? null,
    }));
  }

  async listActiveTheses(limit = 20): Promise<InvestmentThesisRow[]> {
    const rows = await this.sql`
      SELECT * FROM investment_theses
      WHERE mode = 'personal_desk' AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return (rows as any[]).map(coerceThesis);
  }

  async getDeskProposal(id: number): Promise<DeskProposalDetail | null> {
    const proposalRows = await this.sql`
      SELECT *, option_expiry::text AS option_expiry_text
      FROM trade_proposals
      WHERE id = ${id} AND mode = 'personal_desk'
    `;
    if (!proposalRows[0]) return null;
    const proposal = coerceProposal(proposalRows[0]);
    const [thesisRows, riskRows, decisionRows, fillRows, postmortemRows] = await Promise.all([
      this.sql`SELECT * FROM investment_theses WHERE id = ${proposal.thesis_id}`,
      this.sql`SELECT * FROM risk_reviews WHERE proposal_id = ${id}`,
      this.sql`SELECT * FROM proposal_decisions WHERE proposal_id = ${id} ORDER BY decided_at DESC, id DESC`,
      this.sql`SELECT * FROM manual_fills WHERE proposal_id = ${id} ORDER BY filled_at DESC, id DESC`,
      this.sql`SELECT * FROM proposal_postmortems WHERE proposal_id = ${id}`,
    ]);
    return {
      proposal,
      thesis: thesisRows[0] ? coerceThesis(thesisRows[0]) : null,
      riskReview: riskRows[0] ? coerceRiskReview(riskRows[0]) : null,
      decisions: (decisionRows as any[]).map(coerceDecision),
      fills: (fillRows as any[]).map(coerceFill),
      postmortem: postmortemRows[0] ? coercePostmortem(postmortemRows[0]) : null,
    };
  }

  async recordDeskDecision(proposalId: number, input: DecisionInput): Promise<DeskProposalDetail> {
    const current = await this.getDeskProposal(proposalId);
    if (!current) throw new Error("proposal_not_found");
    if (input.decision === "approved" && current.riskReview?.verdict !== "approved") {
      throw new Error("cannot approve without approved risk review");
    }
    if (!canRecordDecision(current.proposal.status)) {
      throw new Error(`cannot decide ${current.proposal.status} proposal`);
    }
    await this.sql`
      INSERT INTO proposal_decisions (proposal_id, decision, reason, edited_order_json)
      VALUES (${proposalId}, ${input.decision}, ${input.reason}, ${input.editedOrder ? JSON.stringify(input.editedOrder) : null}::jsonb)
    `;
    const nextStatus = input.decision === "edited" ? "ready" : input.decision;
    await this.sql`UPDATE trade_proposals SET status = ${nextStatus}, updated_at = now() WHERE id = ${proposalId}`;
    const next = await this.getDeskProposal(proposalId);
    if (!next) throw new Error("proposal_not_found");
    return next;
  }

  async recordManualFill(proposalId: number, input: FillInput): Promise<DeskProposalDetail> {
    const current = await this.getDeskProposal(proposalId);
    if (!current) throw new Error("proposal_not_found");
    if (!canRecordManualFill(current.proposal.status)) {
      throw new Error(`manual fills require approved proposal, got ${current.proposal.status}`);
    }
    const filledAt = input.filledAt ?? new Date().toISOString();
    await this.sql`
      INSERT INTO manual_fills (proposal_id, broker, symbol, side, quantity, price, fees, filled_at, notes)
      VALUES (
        ${proposalId}, ${input.broker}, ${input.symbol}, ${input.side}, ${input.quantity},
        ${input.price}, ${input.fees}, ${filledAt}, ${input.notes ?? null}
      )
    `;
    await this.sql`UPDATE trade_proposals SET status = 'filled', updated_at = now() WHERE id = ${proposalId}`;
    const next = await this.getDeskProposal(proposalId);
    if (!next) throw new Error("proposal_not_found");
    return next;
  }

  async upsertPostmortem(proposalId: number, input: PostmortemInput): Promise<DeskProposalDetail> {
    const current = await this.getDeskProposal(proposalId);
    if (!current) throw new Error("proposal_not_found");
    await this.sql`
      INSERT INTO proposal_postmortems (proposal_id, thesis_outcome, process_score, pnl, mistake_taxonomy, notes)
      VALUES (${proposalId}, ${input.thesisOutcome}, ${input.processScore}, ${input.pnl ?? null}, ${input.mistakeTaxonomy}, ${input.notes})
      ON CONFLICT (proposal_id) DO UPDATE SET
        thesis_outcome = EXCLUDED.thesis_outcome,
        process_score = EXCLUDED.process_score,
        pnl = EXCLUDED.pnl,
        mistake_taxonomy = EXCLUDED.mistake_taxonomy,
        notes = EXCLUDED.notes,
        created_at = now()
    `;
    await this.sql`UPDATE trade_proposals SET status = 'closed', updated_at = now() WHERE id = ${proposalId}`;
    const next = await this.getDeskProposal(proposalId);
    if (!next) throw new Error("proposal_not_found");
    return next;
  }

  async getDeskDashboard(): Promise<DeskDashboard> {
    const [proposals, theses, decisionRows] = await Promise.all([
      this.listDeskProposals(20),
      this.listActiveTheses(12),
      this.sql`
        SELECT * FROM proposal_decisions
        ORDER BY decided_at DESC, id DESC
        LIMIT 12
      `,
    ]);
    const pending = proposals.filter((p) => ["draft", "blocked", "ready", "deferred"].includes(p.status));
    const approved = proposals.filter((p) => ["approved", "filled"].includes(p.status));
    const pendingRisk = pending.reduce((sum, p) => sum + (p.nav_risk_bps ?? 0), 0);
    const approvedRisk = approved.reduce((sum, p) => sum + (p.nav_risk_bps ?? 0), 0);
    return {
      proposals,
      theses,
      recentDecisions: (decisionRows as any[]).map(coerceDecision),
      risk: {
        pendingCount: pending.length,
        activeTheses: theses.length,
        pendingRiskBps: Math.round(pendingRisk * 100) / 100,
        approvedRiskBps: Math.round(approvedRisk * 100) / 100,
        maxSingleRiskBps: Math.round(Math.max(0, ...proposals.map((p) => p.nav_risk_bps ?? 0)) * 100) / 100,
      },
    };
  }

  private async insertRiskReview(proposalId: number, risk: RiskReviewDraft): Promise<RiskReviewRow> {
    const rows = await this.sql`
      INSERT INTO risk_reviews (
        proposal_id, nav_risk_bps, gross_exposure_delta_pct, net_exposure_delta_pct,
        sector_exposure_note, correlation_note, scenario_loss, verdict, notes
      )
      VALUES (
        ${proposalId}, ${risk.navRiskBps}, ${risk.grossExposureDeltaPct}, ${risk.netExposureDeltaPct},
        ${risk.sectorExposureNote}, ${risk.correlationNote}, ${risk.scenarioLoss}, ${risk.verdict}, ${risk.notes}
      )
      RETURNING *
    `;
    return coerceRiskReview(rows[0]);
  }

  private async upsertRiskReview(proposalId: number, risk: RiskReviewDraft): Promise<RiskReviewRow> {
    const rows = await this.sql`
      INSERT INTO risk_reviews (
        proposal_id, nav_risk_bps, gross_exposure_delta_pct, net_exposure_delta_pct,
        sector_exposure_note, correlation_note, scenario_loss, verdict, notes
      )
      VALUES (
        ${proposalId}, ${risk.navRiskBps}, ${risk.grossExposureDeltaPct}, ${risk.netExposureDeltaPct},
        ${risk.sectorExposureNote}, ${risk.correlationNote}, ${risk.scenarioLoss}, ${risk.verdict}, ${risk.notes}
      )
      ON CONFLICT (proposal_id) DO UPDATE SET
        nav_risk_bps = EXCLUDED.nav_risk_bps,
        gross_exposure_delta_pct = EXCLUDED.gross_exposure_delta_pct,
        net_exposure_delta_pct = EXCLUDED.net_exposure_delta_pct,
        sector_exposure_note = EXCLUDED.sector_exposure_note,
        correlation_note = EXCLUDED.correlation_note,
        scenario_loss = EXCLUDED.scenario_loss,
        verdict = EXCLUDED.verdict,
        notes = EXCLUDED.notes,
        created_at = now()
      RETURNING *
    `;
    return coerceRiskReview(rows[0]);
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

  /**
   * Atomically claim queued rows for the daemon's research worker. During a
   * rolling deploy two daemon instances poll concurrently; FOR UPDATE SKIP
   * LOCKED + the claimed_at marker guarantee each report is claimed by exactly
   * one instance (observed in prod: double pickup caused status flapping and
   * spurious "all lenses failed" rows). Claims older than 10 minutes are
   * reclaimable, so a crashed or shut-down daemon's reports get retried.
   */
  async claimResearchReports(limit = 5): Promise<Array<{ id: number; ticker: string }>> {
    const rows = await this.sql`
      UPDATE research_reports r SET claimed_at = now()
      FROM (
        SELECT id FROM research_reports
        WHERE status = 'running' AND report_md IS NULL AND error IS NULL
          AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
        ORDER BY id ASC LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      ) c
      WHERE r.id = c.id
        AND (r.claimed_at IS NULL OR r.claimed_at < now() - interval '10 minutes')
      RETURNING r.id, r.ticker
    `;
    return rows as Array<{ id: number; ticker: string }>;
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
