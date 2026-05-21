/**
 * Policy defaults + policyDigest hashing for precedence-authority.
 *
 * Per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 §"Configuration shape"
 * (default policy) + §"Telemetry shape" (policyDigest).
 */
import type { PrecedenceAuthorityPolicy } from "./types.js";
/**
 * Platform-default policy. Per-tenant override is partial (admin sets only
 * the fields they want to tighten/loosen; rest inherit from these defaults).
 *
 * Defaults per spec §Configuration shape (lines 498-509):
 * - `minPreemptPriority: 'HIGH'` — aligns with Ably HIGH+CRITICAL gate
 * - `signalRecencyMaxHours: 72` — matches Milo Reaper 72h click-attribution
 * - `preemptCooldownHours: 24` — mirrors `escalationCooldownHours` precedent
 * - `exemptFlowTypes: ['mid_transaction', 'client_care']` — Q4 + Q5 lock-tier
 * - `exemptIntensities: ['BLOCKED', 'DORMANT']` — context.ts:94-104 non-contactable
 * - `respectFirstTouchWindow: true` — Q5 agent-first invariant
 * - `respectHandoffAgentLed: true` — Q5 handoff-monitor AGENT_LED
 * - `respectActivePause: true` — Q5 includes spam_complaint default-deny
 * - `respectEnrollmentLock: true` — Q6 enforceEnrollmentPriority priority-30
 */
export declare const DEFAULT_PRECEDENCE_AUTHORITY_POLICY: PrecedenceAuthorityPolicy;
/**
 * Returns SHA-256 hex digest of the cascade-resolved policy. Stored on every
 * `NurturePrecedenceDecision` row at `policyDigest` so admin can answer
 * "I changed policy Wednesday; which decisions ran under the new policy?"
 * without a full join against the audit-trail.
 *
 * Stable across key-ordering and across `exemptFlowTypes` /
 * `exemptIntensities` array-ordering — different admin-input order yields
 * the same digest.
 */
export declare function policyDigest(policy: PrecedenceAuthorityPolicy): string;
//# sourceMappingURL=policy.d.ts.map