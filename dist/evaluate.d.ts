/**
 * evaluatePrecedence — pure-function cascade comparator.
 *
 * Decides whether a goal-shift-bearing signal preempts a lead's currently-
 * active campaign, given the lead's state + cascade-resolved per-tenant
 * policy + candidate campaign.
 *
 * Pure function with injected `now` — 100% branch unit-testable, zero I/O.
 * Caller (Rello's `enrollEligibleCampaigns` helper at Wave 2) is responsible
 * for fetching the inputs and executing the resulting transaction.
 *
 * Cascade order per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 lines 193-204
 * (lock-tier first 1-6 → signal-quality 7-9 → goal-comparison 10):
 *
 * 1. exemptFlowTypes (mid_transaction / client_care + admin-extensions)
 * 2. exemptIntensities (BLOCKED / DORMANT + admin-extensions)
 * 3. handoffMode === 'AGENT_LED' (when respectHandoffAgentLed)
 * 4. firstTouchUrgency != null (when respectFirstTouchWindow)
 * 5. pauseReason != null (when respectActivePause; covers spam_complaint)
 * 6. enrollmentLocked === true (when respectEnrollmentLock)
 * 7. signal.priority < minPreemptPriority
 * 8. (now - signal.detectedAt) > signalRecencyMaxHours
 * 9. lastPreemptedAt within preemptCooldownHours
 * 10. candidateCampaign === null
 * 11/12/13. goal comparison → preempted / no_op_same_goal / no_op_first_enroll
 */
import type { PrecedenceDecision, PrecedenceInput } from "./types.js";
export declare function evaluatePrecedence(input: PrecedenceInput): PrecedenceDecision;
//# sourceMappingURL=evaluate.d.ts.map