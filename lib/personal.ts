import { z } from "zod";

export const DEFAULT_PROFILE_ID = 1;

const money = z.preprocess(
  (v) => (v === "" || v == null ? 0 : Number(v)),
  z.number().min(0)
);

const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().min(0).optional()
);

const positiveMoney = z.preprocess(
  (v) => (typeof v === "string" ? Number(v) : v),
  z.number().positive()
);

const pct = z.preprocess(
  (v) => (v === "" || v == null ? 0 : Number(v)),
  z.number().min(0).max(100)
);

export const RiskToleranceSchema = z.enum(["conservative", "moderate", "aggressive"]);
export type RiskTolerance = z.infer<typeof RiskToleranceSchema>;

export const AssetClassSchema = z.enum(["cash", "equity", "etf", "option", "crypto", "fund", "other"]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const BudgetItemTypeSchema = z.enum(["income", "expense", "debt_payment", "savings_goal"]);
export type BudgetItemType = z.infer<typeof BudgetItemTypeSchema>;

export const PersonalProfileInputSchema = z.object({
  baseCurrency: z.string().trim().min(3).max(3).default("USD").transform((s) => s.toUpperCase()),
  monthlyIncome: money.default(0),
  monthlyExpenses: money.default(0),
  emergencyMonthsTarget: z.preprocess(
    (v) => (v === "" || v == null ? 6 : Number(v)),
    z.number().min(1).max(36)
  ).default(6),
  riskTolerance: RiskToleranceSchema.default("moderate"),
  maxDrawdownPct: pct.default(15),
  maxSinglePositionPct: pct.default(20),
  maxSectorPct: pct.default(35),
  goals: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().default(""),
});
export type PersonalProfileInput = z.infer<typeof PersonalProfileInputSchema>;

export const HoldingInputSchema = z.object({
  account: z.string().trim().min(1).default("Taxable"),
  assetClass: AssetClassSchema.default("equity"),
  symbol: z.string().trim().min(1).max(32).transform((s) => s.toUpperCase()),
  name: z.string().trim().default(""),
  sector: z.string().trim().default("Unclassified"),
  quantity: positiveMoney,
  costBasis: optionalMoney,
  marketPrice: positiveMoney,
  currency: z.string().trim().min(3).max(3).default("USD").transform((s) => s.toUpperCase()),
  liquidity: z.enum(["daily", "weekly", "locked", "unknown"]).default("daily"),
  notes: z.string().trim().default(""),
});
export type HoldingInput = z.infer<typeof HoldingInputSchema>;

export const HoldingPatchSchema = HoldingInputSchema.partial();
export type HoldingPatch = z.infer<typeof HoldingPatchSchema>;

export const BudgetItemInputSchema = z.object({
  itemType: BudgetItemTypeSchema,
  category: z.string().trim().min(1).default("General"),
  label: z.string().trim().min(1),
  monthlyAmount: money,
  priority: z.preprocess(
    (v) => (v === "" || v == null ? 3 : Number(v)),
    z.number().int().min(1).max(5)
  ).default(3),
  notes: z.string().trim().default(""),
});
export type BudgetItemInput = z.infer<typeof BudgetItemInputSchema>;

export const BudgetItemPatchSchema = BudgetItemInputSchema.partial();
export type BudgetItemPatch = z.infer<typeof BudgetItemPatchSchema>;

export const CioAskInputSchema = z.object({
  question: z.string().trim().min(3).max(1200),
});
export type CioAskInput = z.infer<typeof CioAskInputSchema>;

export interface PersonalProfile {
  id: number;
  base_currency: string;
  monthly_income: number;
  monthly_expenses: number;
  emergency_months_target: number;
  risk_tolerance: RiskTolerance;
  max_drawdown_pct: number;
  max_single_position_pct: number;
  max_sector_pct: number;
  goals_json: string[];
  notes: string;
  updated_at: string;
}

export interface Holding {
  id: number;
  account: string;
  asset_class: AssetClass;
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  cost_basis: number | null;
  market_price: number;
  currency: string;
  liquidity: "daily" | "weekly" | "locked" | "unknown";
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: number;
  item_type: BudgetItemType;
  category: string;
  label: string;
  monthly_amount: number;
  priority: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface HoldingView extends Holding {
  market_value: number;
  cost_value: number | null;
  unrealized_pnl: number | null;
  allocation_pct: number;
}

export interface SectorExposure {
  sector: string;
  market_value: number;
  allocation_pct: number;
}

export interface PersonalDashboard {
  profile: PersonalProfile;
  holdings: HoldingView[];
  budgetItems: BudgetItem[];
  sectors: SectorExposure[];
  metrics: {
    netWorth: number;
    cashValue: number;
    investedValue: number;
    monthlyIncome: number;
    monthlyOutflows: number;
    monthlySurplus: number;
    requiredCashReserve: number;
    cashCoverageMonths: number | null;
    investableCash: number;
    maxIdeaRiskDollars: number;
    maxIdeaRiskBps: number;
    largestPositionPct: number;
    largestSectorPct: number;
    contextScore: number;
  };
  alerts: Array<{ severity: "info" | "warning" | "danger"; message: string }>;
  missingContext: string[];
}

export const defaultProfile: PersonalProfile = {
  id: DEFAULT_PROFILE_ID,
  base_currency: "USD",
  monthly_income: 0,
  monthly_expenses: 0,
  emergency_months_target: 6,
  risk_tolerance: "moderate",
  max_drawdown_pct: 15,
  max_single_position_pct: 20,
  max_sector_pct: 35,
  goals_json: [],
  notes: "",
  updated_at: new Date(0).toISOString(),
};

export function buildPersonalDashboard(
  profile: PersonalProfile,
  holdings: Holding[],
  budgetItems: BudgetItem[]
): PersonalDashboard {
  const rawTotal = holdings.reduce((sum, h) => sum + holdingValue(h), 0);
  const netWorth = round2(rawTotal);
  const holdingViews = holdings
    .map((h) => {
      const marketValue = holdingValue(h);
      const costValue = h.cost_basis == null ? null : h.cost_basis * h.quantity;
      return {
        ...h,
        market_value: round2(marketValue),
        cost_value: costValue == null ? null : round2(costValue),
        unrealized_pnl: costValue == null ? null : round2(marketValue - costValue),
        allocation_pct: netWorth > 0 ? round2((marketValue / netWorth) * 100) : 0,
      };
    })
    .sort((a, b) => b.market_value - a.market_value);

  const cashValue = round2(holdingViews.filter((h) => h.asset_class === "cash").reduce((sum, h) => sum + h.market_value, 0));
  const investedValue = round2(Math.max(0, netWorth - cashValue));
  const itemIncome = budgetItems.filter((b) => b.item_type === "income").reduce((sum, b) => sum + b.monthly_amount, 0);
  const itemOutflows = budgetItems
    .filter((b) => b.item_type !== "income")
    .reduce((sum, b) => sum + b.monthly_amount, 0);
  const monthlyIncome = round2(itemIncome > 0 ? itemIncome : profile.monthly_income);
  const monthlyOutflows = round2(itemOutflows > 0 ? itemOutflows : profile.monthly_expenses);
  const monthlySurplus = round2(monthlyIncome - monthlyOutflows);
  const requiredCashReserve = round2(monthlyOutflows * profile.emergency_months_target);
  const cashCoverageMonths = monthlyOutflows > 0 ? round2(cashValue / monthlyOutflows) : null;
  const investableCash = round2(Math.max(0, cashValue - requiredCashReserve));
  const maxIdeaRiskDollars = round2(netWorth * 0.005);
  const largestPositionPct = round2(Math.max(0, ...holdingViews.filter((h) => h.asset_class !== "cash").map((h) => h.allocation_pct)));
  const sectors = buildSectors(holdingViews, netWorth);
  const largestSectorPct = round2(Math.max(0, ...sectors.map((s) => s.allocation_pct)));
  const missingContext = buildMissingContext(profile, holdings, budgetItems);
  const contextScore = Math.max(0, Math.round(((6 - missingContext.length) / 6) * 100));
  const alerts = buildAlerts(profile, holdingViews, {
    netWorth,
    monthlySurplus,
    cashCoverageMonths,
    largestPositionPct,
    largestSectorPct,
  });

  return {
    profile,
    holdings: holdingViews,
    budgetItems,
    sectors,
    metrics: {
      netWorth,
      cashValue,
      investedValue,
      monthlyIncome,
      monthlyOutflows,
      monthlySurplus,
      requiredCashReserve,
      cashCoverageMonths,
      investableCash,
      maxIdeaRiskDollars,
      maxIdeaRiskBps: 50,
      largestPositionPct,
      largestSectorPct,
      contextScore,
    },
    alerts,
    missingContext,
  };
}

export function personalContextForPrompt(dashboard: PersonalDashboard): string {
  const topHoldings = dashboard.holdings.slice(0, 12).map((h) => ({
    symbol: h.symbol,
    assetClass: h.asset_class,
    sector: h.sector,
    value: h.market_value,
    allocationPct: h.allocation_pct,
    pnl: h.unrealized_pnl,
  }));
  return JSON.stringify({
    profile: {
      currency: dashboard.profile.base_currency,
      riskTolerance: dashboard.profile.risk_tolerance,
      maxDrawdownPct: dashboard.profile.max_drawdown_pct,
      maxSinglePositionPct: dashboard.profile.max_single_position_pct,
      maxSectorPct: dashboard.profile.max_sector_pct,
      emergencyMonthsTarget: dashboard.profile.emergency_months_target,
      goals: dashboard.profile.goals_json,
      notes: dashboard.profile.notes,
    },
    metrics: dashboard.metrics,
    alerts: dashboard.alerts,
    missingContext: dashboard.missingContext,
    topHoldings,
    sectors: dashboard.sectors.slice(0, 8),
    budgetItems: dashboard.budgetItems.slice(0, 20).map((b) => ({
      type: b.item_type,
      category: b.category,
      label: b.label,
      monthlyAmount: b.monthly_amount,
      priority: b.priority,
    })),
  });
}

function holdingValue(h: Holding): number {
  return h.quantity * h.market_price;
}

function buildSectors(holdings: HoldingView[], netWorth: number): SectorExposure[] {
  const map = new Map<string, number>();
  for (const h of holdings) {
    if (h.asset_class === "cash") continue;
    const sector = h.sector || "Unclassified";
    map.set(sector, (map.get(sector) ?? 0) + h.market_value);
  }
  return Array.from(map.entries())
    .map(([sector, value]) => ({
      sector,
      market_value: round2(value),
      allocation_pct: netWorth > 0 ? round2((value / netWorth) * 100) : 0,
    }))
    .sort((a, b) => b.market_value - a.market_value);
}

function buildMissingContext(profile: PersonalProfile, holdings: Holding[], budgetItems: BudgetItem[]): string[] {
  const missing: string[] = [];
  if (holdings.length === 0) missing.push("current holdings or cash balance");
  if (!holdings.some((h) => h.asset_class === "cash")) missing.push("cash reserve holding");
  if (profile.monthly_income <= 0 && !budgetItems.some((b) => b.item_type === "income")) missing.push("monthly income");
  if (profile.monthly_expenses <= 0 && !budgetItems.some((b) => b.item_type !== "income")) missing.push("monthly expenses");
  if (profile.goals_json.length === 0 && !profile.notes) missing.push("financial goals and constraints");
  if (holdings.some((h) => h.sector === "Unclassified" && h.asset_class !== "cash")) missing.push("sector tags for concentration risk");
  return missing;
}

function buildAlerts(
  profile: PersonalProfile,
  holdings: HoldingView[],
  metrics: {
    netWorth: number;
    monthlySurplus: number;
    cashCoverageMonths: number | null;
    largestPositionPct: number;
    largestSectorPct: number;
  }
): PersonalDashboard["alerts"] {
  const alerts: PersonalDashboard["alerts"] = [];
  if (metrics.netWorth <= 0) {
    alerts.push({ severity: "info", message: "Add cash and holdings before accepting any investment idea." });
  }
  if (metrics.cashCoverageMonths != null && metrics.cashCoverageMonths < profile.emergency_months_target) {
    alerts.push({
      severity: "warning",
      message: `Cash reserve covers ${metrics.cashCoverageMonths.toFixed(1)} months, below the ${profile.emergency_months_target} month target.`,
    });
  }
  if (metrics.monthlySurplus < 0) {
    alerts.push({ severity: "danger", message: "Monthly cash flow is negative; new risk should be paused until the deficit is explained." });
  }
  if (metrics.largestPositionPct > profile.max_single_position_pct) {
    alerts.push({
      severity: "warning",
      message: `Largest position is ${metrics.largestPositionPct.toFixed(1)}%, above the ${profile.max_single_position_pct}% limit.`,
    });
  }
  if (metrics.largestSectorPct > profile.max_sector_pct) {
    alerts.push({
      severity: "warning",
      message: `Largest sector is ${metrics.largestSectorPct.toFixed(1)}%, above the ${profile.max_sector_pct}% limit.`,
    });
  }
  if (holdings.some((h) => h.asset_class === "option" && h.allocation_pct > 5)) {
    alerts.push({ severity: "warning", message: "Options exposure is above 5% of net worth; review expiry and defined-risk sizing." });
  }
  if (alerts.length === 0) {
    alerts.push({ severity: "info", message: "No major personal risk flags from the data currently entered." });
  }
  return alerts;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
