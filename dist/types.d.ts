/**
 * Types for the Rello nurture-precedence-authority comparator.
 *
 * Pure function `evaluatePrecedence(input: PrecedenceInput): PrecedenceDecision`
 * decides whether a goal-shift-bearing signal preempts a lead's active
 * campaign. Lives in `src/evaluate.ts`.
 *
 * Per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 §"API design" (Q3 lock) +
 * §"Cascade order inside evaluatePrecedence" (Q4 + Q5 + Q6 + Q7 + Q8 + Q9
 * + Q10 + Q11 locks).
 */
import type { SignalPriority } from "@rello-platform/signals";
import type { NurtureGoal } from "@rello-platform/nurture-goals";
export interface PrecedenceSignalInput {
    /** Canonical signalType brand (e.g., `'harvest-home.appraisal_concern'`). */
    signalType: string;
    /** SignalPriority (canonical 4-value union). */
    priority: SignalPriority;
    /**
     * The NurtureGoal this signal points the lead toward. Computed upstream
     * by caller via `inferNurtureGoal` from `@rello-platform/nurture-goals`
     * v0.3.0+. Per spec Hole 1 amendment, callers early-return on null
     * before reaching `evaluatePrecedence`.
     */
    inferredGoal: NurtureGoal;
    /** Timestamp the signal was detected (SignalLog.createdAt). */
    detectedAt: Date;
}
export interface PrecedenceCampaignInput {
    /** Rello Campaign.id. */
    campaignId: string;
    /** Campaign.goalKey — the NurtureGoal the campaign was authored for. */
    goalKey: NurtureGoal;
}
export interface PrecedenceLeadStateInput {
    /**
     * Lead intensity level (from `NurtureEnrollment.intensityLevel` or
     * derived). Includes the off-state values that trigger
     * `blocked_exempt_intensity` (`BLOCKED`, `DORMANT`).
     */
    intensity: "BLOCKED" | "DORMANT" | "MAINTENANCE" | "STANDARD" | "HIGH" | "SURGE" | null;
    /** Lead hot-phase, when active. Not used for any block — informational only. */
    hotPhase: "ACTIVE_PURSUIT" | "SIMMER" | "RESURFACE" | null;
    /**
     * First-touch urgency window — when non-null, agent owns the first touch
     * for an SLA window. Preempting would steal that touch.
     */
    firstTouchUrgency: "IMMEDIATE" | "SAME_DAY" | null;
    /**
     * Handoff mode — `AGENT_LED` means the agent is texting/calling the lead
     * directly; autonomous preempt should yield.
     */
    handoffMode: "FULL_AUTO" | "SUGGEST_ONLY" | "AGENT_LED";
    /**
     * Flow type for the active enrollment. `'mid_transaction'` and
     * `'client_care'` are platform-default exempt; admin can extend.
     */
    flowType: string | null;
    /**
     * When non-null, the lead is paused for some reason (`agent_requested`,
     * `spam_complaint`, etc.). Preempt should yield.
     */
    pauseReason: string | null;
    /**
     * Baseline `NurtureEnrollment.enrollmentLocked` value. Mirrors
     * `enforceEnrollmentPriority` priority-30 rule semantics — when true,
     * signal-driven preempts (priority < 30) block.
     */
    enrollmentLocked: boolean;
}
export interface PrecedenceAuthorityPolicy {
    /** Minimum signal priority required to preempt (default `'HIGH'`). */
    minPreemptPriority: SignalPriority;
    /**
     * Maximum signal recency before blocking (default 72h). Mirrors Milo
     * Reaper 72h click-attribution platform precedent. Validated `[1, 720]`.
     */
    signalRecencyMaxHours: number;
    /**
     * Per-lead preempt cooldown (default 24h, validated `[1, 168]`). Mirrors
     * `escalationCooldownHours` platform precedent. No CRITICAL bypass.
     */
    preemptCooldownHours: number;
    /**
     * FlowTypes that block preempt (default `['mid_transaction',
     * 'client_care']`). Admin can extend per-tenant.
     */
    exemptFlowTypes: ReadonlyArray<string>;
    /**
     * Intensity values that block preempt (default `['BLOCKED', 'DORMANT']`).
     */
    exemptIntensities: ReadonlyArray<string>;
    /** Honor `firstTouchUrgency` agent-first window (default true). */
    respectFirstTouchWindow: boolean;
    /** Honor `handoffMode='AGENT_LED'` (default true). */
    respectHandoffAgentLed: boolean;
    /** Honor `pauseReason != null` (default true; covers spam_complaint). */
    respectActivePause: boolean;
    /** Honor baseline `enrollmentLocked=true` (default true). */
    respectEnrollmentLock: boolean;
}
export interface PrecedenceInput {
    signal: PrecedenceSignalInput;
    /** Currently-active CampaignEnrollment + parent Campaign info. */
    activeCampaign: PrecedenceCampaignInput | null;
    /** Best-match candidate campaign for `signal.inferredGoal` (or null). */
    candidateCampaign: PrecedenceCampaignInput | null;
    leadState: PrecedenceLeadStateInput;
    /** Most-recent `preempted_chained_baseline` outcome timestamp, for cooldown. */
    lastPreemptedAt: Date | null;
    policy: PrecedenceAuthorityPolicy;
    now: Date;
}
export type PrecedenceOutcome = "preempted_chained_baseline" | "no_op_first_enroll" | "no_op_same_goal" | "blocked_exempt_flow_type" | "blocked_exempt_intensity" | "blocked_handoff_agent_led" | "blocked_first_touch_window" | "blocked_paused" | "blocked_enrollment_locked" | "blocked_below_priority_threshold" | "blocked_stale_signal" | "blocked_preempt_cooldown" | "blocked_no_matching_campaign";
export interface PrecedenceDecision {
    outcome: PrecedenceOutcome;
    /**
     * The NurtureGoal the lead's NEXT composition targets:
     * - Preempt arms: `signal.inferredGoal` (winning new goal).
     * - `no_op_same_goal`: `activeCampaign.goalKey` (= `signal.inferredGoal`).
     * - `no_op_first_enroll`: `signal.inferredGoal` (only campaign on lead).
     * - Block-with-active-campaign arms: `activeCampaign.goalKey` (status quo).
     * - Block-no-active arms: `signal.inferredGoal` (informational; no campaign).
     */
    narrowedGoal: NurtureGoal;
    /**
     * The losing goal in a contest, if any. Non-null on `preempted_chained_baseline`
     * (= `activeCampaign.goalKey`) and on `no_op_same_goal` (= `activeCampaign.goalKey`,
     * which happens to equal the inferred). Null when no active campaign existed.
     */
    competingGoal: NurtureGoal | null;
    /** Human-readable, grep-friendly reason string. */
    reason: string;
    /**
     * Attribution factors — list of code-language tags consumed by
     * `NurturePrecedenceDecision.factors` Json column + admin debug surfaces.
     */
    factors: ReadonlyArray<string>;
}
//# sourceMappingURL=types.d.ts.map