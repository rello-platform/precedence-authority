/**
 * @rello-platform/precedence-authority
 *
 * Pure-function precedence-authority comparator for the Rello nurture stack.
 * Single source of truth for goal-shift preempt decisions.
 *
 * Consumers:
 * - Rello's `enrollEligibleCampaigns` connector at
 *   `~/Rello/src/lib/campaigns/enroll-eligible-campaigns.ts` (Wave 2).
 *
 * Per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 §"Phase 3 build sequence →
 * Dispatch 1" Step 3.
 */
export { evaluatePrecedence } from "./evaluate.js";
export { DEFAULT_PRECEDENCE_AUTHORITY_POLICY, policyDigest } from "./policy.js";
export type { PrecedenceAuthorityPolicy, PrecedenceCampaignInput, PrecedenceDecision, PrecedenceInput, PrecedenceLeadStateInput, PrecedenceOutcome, PrecedenceSignalInput, } from "./types.js";
//# sourceMappingURL=index.d.ts.map