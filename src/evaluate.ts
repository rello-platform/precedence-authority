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

import { meetsMinPriority } from "@rello-platform/signals";
import type { NurtureGoal } from "@rello-platform/nurture-goals";
import type {
  PrecedenceDecision,
  PrecedenceInput,
  PrecedenceOutcome,
} from "./types.js";

const MS_PER_HOUR = 1000 * 60 * 60;

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / MS_PER_HOUR;
}

function build(
  outcome: PrecedenceOutcome,
  narrowedGoal: NurtureGoal,
  competingGoal: NurtureGoal | null,
  reason: string,
  factors: ReadonlyArray<string>,
): PrecedenceDecision {
  return { outcome, narrowedGoal, competingGoal, reason, factors };
}

/**
 * Validate runtime invariants on policy. Per spec lines 511-516:
 * - `minPreemptPriority` must NOT be `'LOW'` (TS narrowing typically prevents,
 *   but we double-check at runtime for defense-in-depth).
 * - `signalRecencyMaxHours` must be `>= 1` and `<= 720`.
 * - `preemptCooldownHours` must be `>= 1` and `<= 168`.
 *
 * Throws on violation — comparator boundary is a trust-boundary.
 */
function validatePolicy(policy: PrecedenceInput["policy"]): void {
  if (policy.minPreemptPriority === "LOW") {
    throw new Error(
      `[precedence-authority] invalid policy: minPreemptPriority='LOW' rejected (LOW signals never preempt).`,
    );
  }
  if (
    !Number.isFinite(policy.signalRecencyMaxHours) ||
    policy.signalRecencyMaxHours < 1 ||
    policy.signalRecencyMaxHours > 720
  ) {
    throw new Error(
      `[precedence-authority] invalid policy: signalRecencyMaxHours=${policy.signalRecencyMaxHours} out of range [1, 720].`,
    );
  }
  if (
    !Number.isFinite(policy.preemptCooldownHours) ||
    policy.preemptCooldownHours < 1 ||
    policy.preemptCooldownHours > 168
  ) {
    throw new Error(
      `[precedence-authority] invalid policy: preemptCooldownHours=${policy.preemptCooldownHours} out of range [1, 168].`,
    );
  }
}

export function evaluatePrecedence(input: PrecedenceInput): PrecedenceDecision {
  validatePolicy(input.policy);

  const { signal, activeCampaign, candidateCampaign, leadState, policy, now, lastPreemptedAt } = input;

  // For block arms, narrowedGoal defaults to the lead's current goal context
  // (active campaign's goalKey when there is one, else the signal's goal —
  // informational anchor for telemetry).
  const currentGoal: NurtureGoal = activeCampaign?.goalKey ?? signal.inferredGoal;

  // -------------------------------------------------------------------------
  // Lock-tier cascade (1-6)
  // -------------------------------------------------------------------------

  if (leadState.flowType && policy.exemptFlowTypes.includes(leadState.flowType)) {
    return build(
      "blocked_exempt_flow_type",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead's flowType '${leadState.flowType}' is in policy.exemptFlowTypes.`,
      ["lock_tier", "flow_type_exempt", `flowType=${leadState.flowType}`],
    );
  }

  if (leadState.intensity && policy.exemptIntensities.includes(leadState.intensity)) {
    return build(
      "blocked_exempt_intensity",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead's intensity '${leadState.intensity}' is in policy.exemptIntensities.`,
      ["lock_tier", "intensity_exempt", `intensity=${leadState.intensity}`],
    );
  }

  if (leadState.handoffMode === "AGENT_LED" && policy.respectHandoffAgentLed) {
    return build(
      "blocked_handoff_agent_led",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead's handoffMode is 'AGENT_LED'; autonomous preempt yields to agent.`,
      ["lock_tier", "handoff_agent_led"],
    );
  }

  if (leadState.firstTouchUrgency !== null && policy.respectFirstTouchWindow) {
    return build(
      "blocked_first_touch_window",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead's firstTouchUrgency='${leadState.firstTouchUrgency}' is active; preempting would steal the agent's first touch.`,
      ["lock_tier", "first_touch_window", `urgency=${leadState.firstTouchUrgency}`],
    );
  }

  if (leadState.pauseReason !== null && policy.respectActivePause) {
    return build(
      "blocked_paused",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead is paused with reason '${leadState.pauseReason}'.`,
      ["lock_tier", "paused", `pauseReason=${leadState.pauseReason}`],
    );
  }

  if (leadState.enrollmentLocked && policy.respectEnrollmentLock) {
    return build(
      "blocked_enrollment_locked",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Lead's baseline NurtureEnrollment.enrollmentLocked=true; signal-driven preempt blocked (mirrors enforceEnrollmentPriority priority-30 rule).`,
      ["lock_tier", "enrollment_locked"],
    );
  }

  // -------------------------------------------------------------------------
  // Signal-quality cascade (7-9)
  // -------------------------------------------------------------------------

  if (!meetsMinPriority(signal.priority, policy.minPreemptPriority)) {
    return build(
      "blocked_below_priority_threshold",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Signal priority '${signal.priority}' is below policy.minPreemptPriority='${policy.minPreemptPriority}'.`,
      [
        "signal_quality",
        "below_priority_threshold",
        `signalPriority=${signal.priority}`,
        `minPriority=${policy.minPreemptPriority}`,
      ],
    );
  }

  const recencyHours = hoursBetween(now, signal.detectedAt);
  // Signal is "stale" only if its detectedAt is in the PAST and the elapsed
  // hours exceed the threshold. Future detectedAt (clock skew, edge case)
  // never blocks — small skew should pass-through.
  if (signal.detectedAt.getTime() <= now.getTime() && recencyHours > policy.signalRecencyMaxHours) {
    return build(
      "blocked_stale_signal",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `Signal age ${recencyHours.toFixed(1)}h exceeds policy.signalRecencyMaxHours=${policy.signalRecencyMaxHours}h.`,
      ["signal_quality", "stale_signal", `recencyHours=${recencyHours.toFixed(2)}`],
    );
  }

  if (lastPreemptedAt !== null) {
    const sinceLast = hoursBetween(now, lastPreemptedAt);
    if (sinceLast < policy.preemptCooldownHours) {
      return build(
        "blocked_preempt_cooldown",
        currentGoal,
        activeCampaign ? activeCampaign.goalKey : null,
        `Last preempt was ${sinceLast.toFixed(1)}h ago; cooldown is ${policy.preemptCooldownHours}h. No CRITICAL bypass.`,
        [
          "signal_quality",
          "preempt_cooldown",
          `hoursSinceLast=${sinceLast.toFixed(2)}`,
          `cooldownHours=${policy.preemptCooldownHours}`,
        ],
      );
    }
  }

  // -------------------------------------------------------------------------
  // Candidate-campaign existence (10)
  // -------------------------------------------------------------------------

  if (candidateCampaign === null) {
    return build(
      "blocked_no_matching_campaign",
      currentGoal,
      activeCampaign ? activeCampaign.goalKey : null,
      `No candidate campaign with goalKey='${signal.inferredGoal}' exists for this lead.`,
      ["candidate_missing", `inferredGoal=${signal.inferredGoal}`],
    );
  }

  // -------------------------------------------------------------------------
  // Goal-comparison (11-13)
  // -------------------------------------------------------------------------

  if (activeCampaign === null) {
    // First-enroll path: no active campaign, signal points to a matching one.
    return build(
      "no_op_first_enroll",
      signal.inferredGoal,
      null,
      `Lead has no active campaign; first-enroll into candidate '${candidateCampaign.campaignId}' (goal '${signal.inferredGoal}').`,
      ["no_op", "first_enroll", `candidateCampaign=${candidateCampaign.campaignId}`],
    );
  }

  if (activeCampaign.goalKey === signal.inferredGoal) {
    // Active campaign already targets this goal — no-op.
    return build(
      "no_op_same_goal",
      activeCampaign.goalKey,
      activeCampaign.goalKey,
      `Lead's active campaign '${activeCampaign.campaignId}' already targets '${activeCampaign.goalKey}'.`,
      ["no_op", "same_goal", `activeCampaign=${activeCampaign.campaignId}`],
    );
  }

  // Preempt: active campaign's goal differs from signal's inferred goal.
  return build(
    "preempted_chained_baseline",
    signal.inferredGoal,
    activeCampaign.goalKey,
    `Preempt active campaign '${activeCampaign.campaignId}' (goal '${activeCampaign.goalKey}') for candidate '${candidateCampaign.campaignId}' (goal '${signal.inferredGoal}').`,
    [
      "preempt",
      "chained_baseline",
      `competingGoal=${activeCampaign.goalKey}`,
      `narrowedGoal=${signal.inferredGoal}`,
      `signalPriority=${signal.priority}`,
    ],
  );
}
