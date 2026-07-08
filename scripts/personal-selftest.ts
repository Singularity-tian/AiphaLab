import assert from "node:assert/strict";
import {
  buildPersonalDashboard,
  defaultProfile,
  personalContextForPrompt,
  type BudgetItem,
  type Holding,
  type PersonalProfile,
} from "../lib/personal";

const profile: PersonalProfile = {
  ...defaultProfile,
  monthly_income: 10_000,
  monthly_expenses: 5_000,
  emergency_months_target: 6,
  max_single_position_pct: 25,
  max_sector_pct: 40,
  goals_json: ["Compound capital without risking rent runway"],
  notes: "Own money only.",
};

const holdings: Holding[] = [
  holding(1, "cash", "CASH", "Cash", 40_000, 1, null, "Cash"),
  holding(2, "etf", "VOO", "Vanguard S&P 500", 120, 500, 450, "Index"),
  holding(3, "equity", "NVDA", "Nvidia", 20, 1_000, 700, "Technology"),
];

const dashboard = buildPersonalDashboard(profile, holdings, []);
assert.equal(dashboard.metrics.netWorth, 120_000);
assert.equal(dashboard.metrics.cashValue, 40_000);
assert.equal(dashboard.metrics.requiredCashReserve, 30_000);
assert.equal(dashboard.metrics.investableCash, 10_000);
assert.equal(dashboard.metrics.maxIdeaRiskDollars, 600);
assert.equal(dashboard.metrics.cashCoverageMonths, 8);
assert.equal(dashboard.metrics.monthlySurplus, 5_000);
assert.equal(dashboard.missingContext.length, 0);
assert.ok(dashboard.sectors.some((s) => s.sector === "Index" && s.allocation_pct > 45));
assert.ok(dashboard.alerts.some((a) => a.message.includes("Largest sector")));

const budgetItems: BudgetItem[] = [
  budget(1, "income", "salary", "Salary", 12_000),
  budget(2, "expense", "housing", "Rent", 4_000),
  budget(3, "expense", "life", "Living", 2_000),
];
const budgetDashboard = buildPersonalDashboard(profile, holdings, budgetItems);
assert.equal(budgetDashboard.metrics.monthlyIncome, 12_000);
assert.equal(budgetDashboard.metrics.monthlyOutflows, 6_000);
assert.equal(budgetDashboard.metrics.requiredCashReserve, 36_000);

const emptyDashboard = buildPersonalDashboard(defaultProfile, [], []);
assert.ok(emptyDashboard.missingContext.includes("current holdings or cash balance"));
assert.equal(emptyDashboard.metrics.contextScore < 50, true);

const context = personalContextForPrompt(dashboard);
assert.ok(context.includes("cashCoverageMonths"));
assert.ok(context.includes("Compound capital"));
assert.ok(context.includes("NVDA"));

console.log("personal CIO self-test passed");

function holding(
  id: number,
  asset_class: Holding["asset_class"],
  symbol: string,
  name: string,
  quantity: number,
  market_price: number,
  cost_basis: number | null,
  sector: string
): Holding {
  return {
    id,
    account: "Test",
    asset_class,
    symbol,
    name,
    sector,
    quantity,
    cost_basis,
    market_price,
    currency: "USD",
    liquidity: "daily",
    notes: "",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

function budget(
  id: number,
  item_type: BudgetItem["item_type"],
  category: string,
  label: string,
  monthly_amount: number
): BudgetItem {
  return {
    id,
    item_type,
    category,
    label,
    monthly_amount,
    priority: 3,
    notes: "",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}
