/**
 * evaluatePrecedence — 13-arm outcome cascade coverage.
 *
 * Test surface per NURTURE-PRECEDENCE-AUTHORITY-SPEC-260520 §"Test plan
 * Wave 1" (lines 793-838): one fixture per outcome arm + cascade-order tests
 * (lock-tier fires before signal-quality, signal-quality fires before
 * goal-comparison) + edge cases (clock skew, policy validation, factors).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePrecedence,
  DEFAULT_PRECEDENCE_AUTHORITY_POLICY,
  policyDigest,
} from '../dist/index.js';

const NOW = new Date('2026-05-21T12:00:00Z');

function makeInput(over = {}) {
  return {
    signal: {
      signalType: 'harvest-home.rate_drop_detected',
      priority: 'HIGH',
      inferredGoal: 'REFINANCE',
      detectedAt: new Date('2026-05-21T11:00:00Z'),
      ...(over.signal || {}),
    },
    activeCampaign: over.activeCampaign === null
      ? null
      : { campaignId: 'camp_active', goalKey: 'HOME_PURCHASE', ...(over.activeCampaign || {}) },
    candidateCampaign: over.candidateCampaign === null
      ? null
      : { campaignId: 'camp_candidate', goalKey: 'REFINANCE', ...(over.candidateCampaign || {}) },
    leadState: {
      intensity: 'STANDARD',
      hotPhase: null,
      firstTouchUrgency: null,
      handoffMode: 'FULL_AUTO',
      flowType: 'standard',
      pauseReason: null,
      enrollmentLocked: false,
      ...(over.leadState || {}),
    },
    lastPreemptedAt: over.lastPreemptedAt ?? null,
    policy: { ...DEFAULT_PRECEDENCE_AUTHORITY_POLICY, ...(over.policy || {}) },
    now: over.now ?? NOW,
  };
}

// =============================================================================
// Lock-tier exemption tests (Q4 + Q5 + Q6)
// =============================================================================

describe('lock-tier — exemptFlowTypes', () => {
  it("flowType='mid_transaction' → blocked_exempt_flow_type", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { flowType: 'mid_transaction' } }));
    assert.equal(r.outcome, 'blocked_exempt_flow_type');
    assert.ok(r.reason.includes('mid_transaction'));
    assert.ok(r.factors.includes('lock_tier'));
  });
  it("flowType='client_care' → blocked_exempt_flow_type", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { flowType: 'client_care' } }));
    assert.equal(r.outcome, 'blocked_exempt_flow_type');
  });
  it("admin-extended exemptFlowTypes honors per-tenant override", () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { flowType: 'custom_flow' },
      policy: { exemptFlowTypes: ['mid_transaction', 'client_care', 'custom_flow'] },
    }));
    assert.equal(r.outcome, 'blocked_exempt_flow_type');
  });
});

describe('lock-tier — exemptIntensities', () => {
  it("intensity='BLOCKED' → blocked_exempt_intensity", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { intensity: 'BLOCKED' } }));
    assert.equal(r.outcome, 'blocked_exempt_intensity');
  });
  it("intensity='DORMANT' → blocked_exempt_intensity", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { intensity: 'DORMANT' } }));
    assert.equal(r.outcome, 'blocked_exempt_intensity');
  });
});

describe('lock-tier — handoffMode AGENT_LED', () => {
  it("handoffMode='AGENT_LED' → blocked_handoff_agent_led", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { handoffMode: 'AGENT_LED' } }));
    assert.equal(r.outcome, 'blocked_handoff_agent_led');
  });
  it('policy.respectHandoffAgentLed=false bypasses the block', () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { handoffMode: 'AGENT_LED' },
      policy: { respectHandoffAgentLed: false },
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
});

describe('lock-tier — firstTouchUrgency', () => {
  it("firstTouchUrgency='IMMEDIATE' → blocked_first_touch_window", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { firstTouchUrgency: 'IMMEDIATE' } }));
    assert.equal(r.outcome, 'blocked_first_touch_window');
  });
  it("firstTouchUrgency='SAME_DAY' → blocked_first_touch_window", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { firstTouchUrgency: 'SAME_DAY' } }));
    assert.equal(r.outcome, 'blocked_first_touch_window');
  });
});

describe('lock-tier — pauseReason', () => {
  it("pauseReason='agent_requested' → blocked_paused", () => {
    const r = evaluatePrecedence(makeInput({ leadState: { pauseReason: 'agent_requested' } }));
    assert.equal(r.outcome, 'blocked_paused');
  });
  it("pauseReason='spam_complaint' → blocked_paused (priority over enrollmentLocked)", () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { pauseReason: 'spam_complaint', enrollmentLocked: true },
    }));
    assert.equal(r.outcome, 'blocked_paused');
  });
});

describe('lock-tier — enrollmentLocked', () => {
  it('enrollmentLocked=true (no other exemption) → blocked_enrollment_locked', () => {
    const r = evaluatePrecedence(makeInput({ leadState: { enrollmentLocked: true } }));
    assert.equal(r.outcome, 'blocked_enrollment_locked');
  });
  it('policy.respectEnrollmentLock=false bypasses the block', () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { enrollmentLocked: true },
      policy: { respectEnrollmentLock: false },
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
});

// =============================================================================
// Signal-quality gate tests (Q7 + Q8 + Q9 + Q10a)
// =============================================================================

describe('signal-quality — minPreemptPriority threshold', () => {
  it('LOW × HIGH → blocked_below_priority_threshold', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'LOW' },
      policy: { minPreemptPriority: 'HIGH' },
    }));
    assert.equal(r.outcome, 'blocked_below_priority_threshold');
  });
  it('MEDIUM × HIGH → blocked_below_priority_threshold', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'MEDIUM' },
      policy: { minPreemptPriority: 'HIGH' },
    }));
    assert.equal(r.outcome, 'blocked_below_priority_threshold');
  });
  it('HIGH × HIGH → passes threshold (preempts)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'HIGH' },
      policy: { minPreemptPriority: 'HIGH' },
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('CRITICAL × HIGH → passes threshold (preempts)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'CRITICAL' },
      policy: { minPreemptPriority: 'HIGH' },
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('CRITICAL × MEDIUM → passes (tunable lower)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'CRITICAL' },
      policy: { minPreemptPriority: 'MEDIUM' },
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('HIGH × CRITICAL → blocked (tunable up)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'HIGH' },
      policy: { minPreemptPriority: 'CRITICAL' },
    }));
    assert.equal(r.outcome, 'blocked_below_priority_threshold');
  });
});

describe('signal-quality — recency', () => {
  it('detectedAt = now - 71h → passes (under 72h default)', () => {
    const detectedAt = new Date(NOW.getTime() - 71 * 3600 * 1000);
    const r = evaluatePrecedence(makeInput({ signal: { detectedAt } }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('detectedAt = now - 73h → blocked_stale_signal', () => {
    const detectedAt = new Date(NOW.getTime() - 73 * 3600 * 1000);
    const r = evaluatePrecedence(makeInput({ signal: { detectedAt } }));
    assert.equal(r.outcome, 'blocked_stale_signal');
  });
  it('detectedAt = now + 5min (clock skew) → passes (future timestamp never stale)', () => {
    const detectedAt = new Date(NOW.getTime() + 5 * 60 * 1000);
    const r = evaluatePrecedence(makeInput({ signal: { detectedAt } }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('signalRecencyMaxHours=0 → throws (invalid policy)', () => {
    assert.throws(
      () => evaluatePrecedence(makeInput({ policy: { signalRecencyMaxHours: 0 } })),
      /signalRecencyMaxHours=0 out of range/,
    );
  });
  it('signalRecencyMaxHours=721 → throws (invalid policy)', () => {
    assert.throws(
      () => evaluatePrecedence(makeInput({ policy: { signalRecencyMaxHours: 721 } })),
      /signalRecencyMaxHours=721 out of range/,
    );
  });
});

describe('signal-quality — preempt cooldown', () => {
  it('lastPreemptedAt = now - 23h → blocked_preempt_cooldown', () => {
    const r = evaluatePrecedence(makeInput({
      lastPreemptedAt: new Date(NOW.getTime() - 23 * 3600 * 1000),
    }));
    assert.equal(r.outcome, 'blocked_preempt_cooldown');
  });
  it('lastPreemptedAt = now - 25h → passes cooldown', () => {
    const r = evaluatePrecedence(makeInput({
      lastPreemptedAt: new Date(NOW.getTime() - 25 * 3600 * 1000),
    }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('lastPreemptedAt = null → passes cooldown (no prior preempt)', () => {
    const r = evaluatePrecedence(makeInput({ lastPreemptedAt: null }));
    assert.equal(r.outcome, 'preempted_chained_baseline');
  });
  it('CRITICAL signal + recent lastPreemptedAt → STILL blocked (no priority bypass)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'CRITICAL' },
      lastPreemptedAt: new Date(NOW.getTime() - 1 * 3600 * 1000),
    }));
    assert.equal(r.outcome, 'blocked_preempt_cooldown');
  });
  it('preemptCooldownHours=0 → throws (invalid policy)', () => {
    assert.throws(
      () => evaluatePrecedence(makeInput({ policy: { preemptCooldownHours: 0 } })),
      /preemptCooldownHours=0 out of range/,
    );
  });
  it('preemptCooldownHours=169 → throws (invalid policy)', () => {
    assert.throws(
      () => evaluatePrecedence(makeInput({ policy: { preemptCooldownHours: 169 } })),
      /preemptCooldownHours=169 out of range/,
    );
  });
});

describe('signal-quality — minPreemptPriority LOW rejection', () => {
  it("minPreemptPriority='LOW' → throws (rejected at runtime)", () => {
    assert.throws(
      () => evaluatePrecedence(makeInput({ policy: { minPreemptPriority: 'LOW' } })),
      /minPreemptPriority='LOW' rejected/,
    );
  });
});

// =============================================================================
// Goal-comparison tests (Q2)
// =============================================================================

describe('goal-comparison — outcome arms', () => {
  it('activeCampaign=null + candidateCampaign≠null → no_op_first_enroll', () => {
    const r = evaluatePrecedence(makeInput({ activeCampaign: null }));
    assert.equal(r.outcome, 'no_op_first_enroll');
    assert.equal(r.competingGoal, null);
    assert.equal(r.narrowedGoal, 'REFINANCE');
  });
  it('activeCampaign.goalKey === candidateCampaign.goalKey → no_op_same_goal', () => {
    const r = evaluatePrecedence(makeInput({
      activeCampaign: { campaignId: 'camp_active', goalKey: 'REFINANCE' },
    }));
    assert.equal(r.outcome, 'no_op_same_goal');
    assert.equal(r.competingGoal, 'REFINANCE');
    assert.equal(r.narrowedGoal, 'REFINANCE');
  });
  it('active.goalKey !== signal.inferredGoal + candidate matches → preempted_chained_baseline', () => {
    const r = evaluatePrecedence(makeInput());
    assert.equal(r.outcome, 'preempted_chained_baseline');
    assert.equal(r.competingGoal, 'HOME_PURCHASE');
    assert.equal(r.narrowedGoal, 'REFINANCE');
  });
  it('active.goalKey !== signal.inferredGoal + candidate=null → blocked_no_matching_campaign', () => {
    const r = evaluatePrecedence(makeInput({ candidateCampaign: null }));
    assert.equal(r.outcome, 'blocked_no_matching_campaign');
  });
});

// =============================================================================
// Cascade-order tests — lock-tier fires before signal-quality before goal-comp
// =============================================================================

describe('cascade-order — lock-tier wins over signal-quality', () => {
  it("flowType='mid_transaction' + priority='LOW' → blocked_exempt_flow_type (NOT priority)", () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { flowType: 'mid_transaction' },
      signal: { priority: 'LOW' },
    }));
    assert.equal(r.outcome, 'blocked_exempt_flow_type');
  });
  it('enrollmentLocked + recent lastPreemptedAt → blocked_enrollment_locked (NOT cooldown)', () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { enrollmentLocked: true },
      lastPreemptedAt: new Date(NOW.getTime() - 1 * 3600 * 1000),
    }));
    assert.equal(r.outcome, 'blocked_enrollment_locked');
  });
  it("intensity='BLOCKED' + stale signal + candidate=null → blocked_exempt_intensity (NOT later arms)", () => {
    const r = evaluatePrecedence(makeInput({
      leadState: { intensity: 'BLOCKED' },
      signal: { detectedAt: new Date(NOW.getTime() - 100 * 3600 * 1000) },
      candidateCampaign: null,
    }));
    assert.equal(r.outcome, 'blocked_exempt_intensity');
  });
});

describe('cascade-order — signal-quality wins over goal-comparison', () => {
  it('LOW priority + active campaign + matching candidate → blocked_below_priority_threshold (NOT preempt)', () => {
    const r = evaluatePrecedence(makeInput({
      signal: { priority: 'LOW' },
      policy: { minPreemptPriority: 'MEDIUM' },
    }));
    assert.equal(r.outcome, 'blocked_below_priority_threshold');
  });
});

// =============================================================================
// Edge cases — factors[] + narrowedGoal + competingGoal + reason format
// =============================================================================

describe('decision shape — factors, narrowedGoal, competingGoal, reason', () => {
  it('preempted_chained_baseline carries all expected factors', () => {
    const r = evaluatePrecedence(makeInput());
    assert.ok(r.factors.includes('preempt'));
    assert.ok(r.factors.includes('chained_baseline'));
    assert.ok(r.factors.some((f) => f.startsWith('competingGoal=')));
    assert.ok(r.factors.some((f) => f.startsWith('narrowedGoal=')));
    assert.ok(r.factors.some((f) => f.startsWith('signalPriority=')));
  });
  it('blocked-with-no-active-campaign carries narrowedGoal=signal.inferredGoal', () => {
    const r = evaluatePrecedence(makeInput({
      activeCampaign: null,
      candidateCampaign: null,
    }));
    assert.equal(r.outcome, 'blocked_no_matching_campaign');
    assert.equal(r.narrowedGoal, 'REFINANCE');
    assert.equal(r.competingGoal, null);
  });
  it('reason strings are human-readable and grep-friendly', () => {
    const r = evaluatePrecedence(makeInput({ leadState: { flowType: 'mid_transaction' } }));
    assert.match(r.reason, /flowType/);
    assert.match(r.reason, /mid_transaction/);
  });
});

// =============================================================================
// All policy defaults exercised
// =============================================================================

describe('DEFAULT_PRECEDENCE_AUTHORITY_POLICY — sanity', () => {
  it('default policy exists with expected fields', () => {
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.minPreemptPriority, 'HIGH');
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.signalRecencyMaxHours, 72);
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.preemptCooldownHours, 24);
    assert.deepEqual([...DEFAULT_PRECEDENCE_AUTHORITY_POLICY.exemptFlowTypes], [
      'mid_transaction',
      'client_care',
    ]);
    assert.deepEqual([...DEFAULT_PRECEDENCE_AUTHORITY_POLICY.exemptIntensities], [
      'BLOCKED',
      'DORMANT',
    ]);
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectFirstTouchWindow, true);
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectHandoffAgentLed, true);
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectActivePause, true);
    assert.equal(DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectEnrollmentLock, true);
  });
});
