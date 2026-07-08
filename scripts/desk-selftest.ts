#!/usr/bin/env tsx

import assert from "node:assert/strict";
import {
  DeskProposalInputSchema,
  buildRiskReview,
  canRecordDecision,
  canRecordManualFill,
  normalizeProposalInput,
  riskBps,
} from "../lib/desk";
import { ResearchProposalResponseSchema, buildPrompt } from "../app/api/desk/proposals/from-research/route";

const base = {
  ticker: "META",
  direction: "long" as const,
  horizon: "2-8 weeks",
  catalyst: "Earnings revision and AI capex debate",
  thesis: "META has enough free cash flow and ad momentum to support a tactical long if valuation remains disciplined.",
  invalidation: "Revenue growth decelerates while capex guidance rises again.",
  confidence: 0.62,
  sources: ["unit-test"],
  instrumentType: "equity" as const,
  entryPrice: 500,
  targetPrice: 560,
  stopPrice: 480,
  quantity: 1,
  maxLoss: 500,
  accountNav: 100000,
  rationale: "The setup has a clear catalyst, a defined invalidation, and a starter-size risk budget.",
};

assert.equal(riskBps(500, 100000), 50);
assert.equal(buildRiskReview(base).navRiskBps, 50);

assert.throws(
  () => normalizeProposalInput({ ...base, maxLoss: 501 }),
  /exceeds 50 bps max/
);

assert.equal(
  DeskProposalInputSchema.safeParse({ ...base, invalidation: "" }).success,
  false
);

assert.equal(
  DeskProposalInputSchema.safeParse({
    ...base,
    instrumentType: "option",
    option: {
      strategy: "naked_short_call",
      expiry: "2026-09-18",
      strikes: [600],
      premium: 5,
      breakeven: 605,
      impliedVolNote: "IV is elevated.",
      liquidityNote: "Spreads are acceptable.",
    },
  }).success,
  false
);

const optionProposal = normalizeProposalInput({
  ...base,
  instrumentType: "option",
  maxLoss: 350,
  option: {
    strategy: "debit_spread",
    expiry: "2026-09-18",
    strikes: [520, 560],
    premium: 3.5,
    maxGain: 36.5,
    breakeven: 523.5,
    impliedVolNote: "IV is acceptable for a defined-risk spread.",
    liquidityNote: "Use limit orders only; spreads must stay tight.",
  },
});
assert.equal(optionProposal.option?.strategy, "debit_spread");
assert.equal(buildRiskReview(optionProposal).verdict, "approved");

assert.equal(canRecordManualFill("approved"), true);
assert.equal(canRecordManualFill("rejected"), false);
assert.equal(canRecordManualFill("deferred"), false);
assert.equal(canRecordDecision("ready"), true);
assert.equal(canRecordDecision("deferred"), true);
assert.equal(canRecordDecision("rejected"), false);
assert.equal(canRecordDecision("filled"), false);
assert.equal(canRecordDecision("closed"), false);

const wrapped = ResearchProposalResponseSchema.parse({ proposal: base });
assert.equal(wrapped.ticker, "META");
assert.equal(wrapped.horizon, "2-8 weeks");

const prompt = buildPrompt("META", "# META report\nBullish but risk-managed.", 100000, "equity");
assert.match(prompt, /"horizon"/);
assert.match(prompt, /"catalyst"/);
assert.match(prompt, /"entryPrice"/);
assert.match(prompt, /Return exactly one JSON object/);

console.log("desk self-test passed");
