import { z } from "zod";

export const DESK_MODE = "personal_desk" as const;
export const DEFAULT_ACCOUNT_NAV = 100_000;
export const MAX_RISK_BPS = 50;
export const MIN_TARGET_RISK_BPS = 25;

export const ProposalStatusSchema = z.enum([
  "draft",
  "blocked",
  "ready",
  "approved",
  "rejected",
  "deferred",
  "filled",
  "closed",
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const InstrumentTypeSchema = z.enum(["equity", "option"]);
export type InstrumentType = z.infer<typeof InstrumentTypeSchema>;

export const DirectionSchema = z.enum(["long", "short", "hedge"]);
export type ProposalDirection = z.infer<typeof DirectionSchema>;

export const DecisionSchema = z.enum(["approved", "rejected", "deferred", "edited"]);
export type ProposalDecision = z.infer<typeof DecisionSchema>;

export const AllowedOptionStrategySchema = z.enum([
  "long_call",
  "long_put",
  "debit_spread",
  "collar",
  "covered_call",
  "protective_put",
]);
export type AllowedOptionStrategy = z.infer<typeof AllowedOptionStrategySchema>;

const optionalPositive = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().positive().optional()
);

const positiveNumber = z.preprocess(
  (v) => (typeof v === "string" ? Number(v) : v),
  z.number().positive()
);

const confidenceNumber = z.preprocess(
  (v) => (v === "" || v == null ? 0.6 : Number(v)),
  z.number().min(0).max(1)
);

export const OptionProposalSchema = z.object({
  strategy: AllowedOptionStrategySchema,
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiry must be YYYY-MM-DD"),
  strikes: z.array(z.number().positive()).min(1).max(4),
  premium: positiveNumber,
  maxGain: optionalPositive,
  breakeven: positiveNumber,
  impliedVolNote: z.string().trim().min(3),
  liquidityNote: z.string().trim().min(3),
});
export type OptionProposalInput = z.infer<typeof OptionProposalSchema>;

export const DeskProposalInputSchema = z.object({
  ticker: z.string().trim().min(1).max(12).transform((s) => s.toUpperCase()),
  direction: DirectionSchema.default("long"),
  horizon: z.string().trim().min(3),
  catalyst: z.string().trim().min(3),
  thesis: z.string().trim().min(20),
  invalidation: z.string().trim().min(10),
  confidence: confidenceNumber.default(0.6),
  sources: z.array(z.string().trim().min(1)).default([]),
  instrumentType: InstrumentTypeSchema.default("equity"),
  entryPrice: positiveNumber,
  targetPrice: optionalPositive,
  stopPrice: optionalPositive,
  quantity: positiveNumber,
  maxLoss: positiveNumber,
  accountNav: positiveNumber.default(DEFAULT_ACCOUNT_NAV),
  rationale: z.string().trim().min(20),
  researchReportId: z.number().int().positive().optional(),
  option: OptionProposalSchema.optional(),
});
export type DeskProposalInput = z.infer<typeof DeskProposalInputSchema>;

export const DeskProposalPatchSchema = DeskProposalInputSchema.partial().extend({
  status: ProposalStatusSchema.optional(),
});
export type DeskProposalPatch = z.infer<typeof DeskProposalPatchSchema>;

export const FillInputSchema = z.object({
  broker: z.string().trim().min(2),
  symbol: z.string().trim().min(1).max(32).transform((s) => s.toUpperCase()),
  side: z.enum(["BUY", "SELL"]),
  quantity: positiveNumber,
  price: positiveNumber,
  fees: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0)).default(0),
  filledAt: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});
export type FillInput = z.infer<typeof FillInputSchema>;

export const PostmortemInputSchema = z.object({
  thesisOutcome: z.string().trim().min(3),
  processScore: z.preprocess((v) => Number(v), z.number().int().min(1).max(10)),
  pnl: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional()),
  mistakeTaxonomy: z.string().trim().min(3),
  notes: z.string().trim().min(3),
});
export type PostmortemInput = z.infer<typeof PostmortemInputSchema>;

export const DecisionInputSchema = z.object({
  decision: DecisionSchema,
  reason: z.string().trim().min(3),
  editedOrder: z.record(z.string(), z.unknown()).optional(),
});
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

export interface RiskReviewDraft {
  navRiskBps: number;
  grossExposureDeltaPct: number;
  netExposureDeltaPct: number;
  scenarioLoss: number;
  verdict: "approved" | "blocked";
  sectorExposureNote: string;
  correlationNote: string;
  notes: string;
}

export interface ManualOrderTicket {
  mode: typeof DESK_MODE;
  manualOnly: true;
  instrumentType: InstrumentType;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderTypeSuggestion: "LIMIT";
  limitReference: number;
  option?: {
    strategy: AllowedOptionStrategy;
    expiry: string;
    strikes: number[];
    premium: number;
    breakeven: number;
  };
}

export function riskBps(maxLoss: number, accountNav: number): number {
  if (accountNav <= 0) return Infinity;
  return (maxLoss / accountNav) * 10_000;
}

export function validateProposalPolicy(input: DeskProposalInput): void {
  const bps = riskBps(input.maxLoss, input.accountNav);
  if (bps > MAX_RISK_BPS) {
    throw new Error(`risk ${bps.toFixed(1)} bps exceeds ${MAX_RISK_BPS} bps max`);
  }
  if (input.instrumentType === "option" && !input.option) {
    throw new Error("option proposal requires structured option terms");
  }
  if (input.instrumentType === "equity" && input.option) {
    throw new Error("equity proposal cannot include option terms");
  }
}

export function buildRiskReview(input: DeskProposalInput): RiskReviewDraft {
  validateProposalPolicy(input);
  const exposure = (input.entryPrice * input.quantity) / input.accountNav;
  const signedExposure = input.direction === "short" ? -exposure : exposure;
  const bps = riskBps(input.maxLoss, input.accountNav);
  const lowRiskNote = bps < MIN_TARGET_RISK_BPS
    ? `Below ${MIN_TARGET_RISK_BPS} bps target lane; acceptable for starter/tracker size.`
    : "Inside PM-conservative 25-50 bps lane.";

  return {
    navRiskBps: round2(bps),
    grossExposureDeltaPct: round2(Math.abs(exposure) * 100),
    netExposureDeltaPct: round2(signedExposure * 100),
    scenarioLoss: round2(input.maxLoss),
    verdict: "approved",
    sectorExposureNote: "Sector exposure requires PM review before manual execution.",
    correlationNote: "Correlation/factor exposure requires PM review against current book.",
    notes: `${lowRiskNote} No leverage or autonomous broker execution is permitted in v1.`,
  };
}

export function buildManualOrderTicket(input: DeskProposalInput): ManualOrderTicket {
  const ticket: ManualOrderTicket = {
    mode: DESK_MODE,
    manualOnly: true,
    instrumentType: input.instrumentType,
    symbol: input.ticker,
    side: input.direction === "short" ? "SELL" : "BUY",
    quantity: input.quantity,
    orderTypeSuggestion: "LIMIT",
    limitReference: input.entryPrice,
  };
  if (input.option) {
    ticket.option = {
      strategy: input.option.strategy,
      expiry: input.option.expiry,
      strikes: input.option.strikes,
      premium: input.option.premium,
      breakeven: input.option.breakeven,
    };
  }
  return ticket;
}

export function canRecordManualFill(status: ProposalStatus): boolean {
  return status === "approved";
}

export function canRecordDecision(status: ProposalStatus): boolean {
  return !["rejected", "filled", "closed"].includes(status);
}

export function normalizeProposalInput(raw: unknown): DeskProposalInput {
  const parsed = DeskProposalInputSchema.parse(raw);
  validateProposalPolicy(parsed);
  return parsed;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
