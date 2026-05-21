# @rello-platform/precedence-authority

Pure-function precedence-authority comparator for the Rello nurture stack. Decides whether a goal-shift-bearing signal preempts a lead's currently-active campaign.

## What lives here

- **`evaluatePrecedence(input: PrecedenceInput): PrecedenceDecision`** — pure function, zero I/O, injected `now`, trivially unit-testable. 13-arm discriminated-union outcome:

  Lock-tier exemptions (admin-tunable defaults; cascade order 1-6):
  - `blocked_exempt_flow_type` — `flowType ∈ exemptFlowTypes` (`mid_transaction`, `client_care`).
  - `blocked_exempt_intensity` — `intensity ∈ exemptIntensities` (`BLOCKED`, `DORMANT`).
  - `blocked_handoff_agent_led` — `handoffMode === 'AGENT_LED'`.
  - `blocked_first_touch_window` — `firstTouchUrgency != null`.
  - `blocked_paused` — `pauseReason != null` (covers `spam_complaint` default-deny).
  - `blocked_enrollment_locked` — baseline `NurtureEnrollment.enrollmentLocked=true`.

  Signal-quality gates (cascade order 7-9):
  - `blocked_below_priority_threshold` — `signal.priority < policy.minPreemptPriority`.
  - `blocked_stale_signal` — `(now - signal.detectedAt) > policy.signalRecencyMaxHours`.
  - `blocked_preempt_cooldown` — `lastPreemptedAt` within `preemptCooldownHours`.

  Candidate-campaign existence + goal comparison (cascade order 10-13):
  - `blocked_no_matching_campaign` — no candidate campaign for `signal.inferredGoal`.
  - `no_op_first_enroll` — no active campaign; candidate matches → first-enroll.
  - `no_op_same_goal` — active campaign already targets `signal.inferredGoal`.
  - `preempted_chained_baseline` — active goal differs; preempt out, enroll in.

- **`DEFAULT_PRECEDENCE_AUTHORITY_POLICY`** — platform defaults (`minPreemptPriority: 'HIGH'`, `signalRecencyMaxHours: 72`, `preemptCooldownHours: 24`, etc.).
- **`policyDigest(policy)`** — SHA-256 hex digest of stable-stringified policy. Stored on every `NurturePrecedenceDecision` audit row so admin can answer "which decisions ran under which policy version" without joins.

## Why a separate package

Pure-function comparator that the Rello-side caller (`enrollEligibleCampaigns`) imports + executes. Mirrors `@rello-platform/enrollments` extraction precedent — compile-time invariance across any future caller. Engines have NO precedence storage (per `~CASCADING-GUARDRAILS-AND-SETTINGS-README.md §2`).

## Consumption

```ts
import {
  evaluatePrecedence,
  DEFAULT_PRECEDENCE_AUTHORITY_POLICY,
  type PrecedenceInput,
} from '@rello-platform/precedence-authority';
import { inferNurtureGoal } from '@rello-platform/nurture-goals';

const inferredGoal = inferNurtureGoal({ signalType, signalPayload, lead });
if (inferredGoal === null) return null; // Non-goal-shift signal

const decision = evaluatePrecedence({
  signal: { signalType, priority, inferredGoal, detectedAt },
  activeCampaign,
  candidateCampaign,
  leadState,
  lastPreemptedAt,
  policy: effectivePolicy,
  now: new Date(),
});

switch (decision.outcome) {
  case 'preempted_chained_baseline':
    /* exit active + enroll candidate + write audit row */
    break;
  // ...
}
```

## Versioning

- `0.1.0` — initial publish; 13-arm comparator + DEFAULT_PRECEDENCE_AUTHORITY_POLICY + policyDigest. Per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 Wave 1 + DECISIONS-260519 D11-CORRECTED Hole 1/2/3 amendments. Consumed by Rello Wave 2 `enrollEligibleCampaigns` connector.

Follow `github:rello-platform/precedence-authority#vX.Y.Z` tag-based consumption.
