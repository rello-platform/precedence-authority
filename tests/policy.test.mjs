/**
 * policyDigest — SHA-256 hashing stability tests.
 *
 * Per spec line 837 — "policyDigest reproducible (SHA-256 of stable-stringified
 * policy)". Reorderings of object keys + array members do NOT change the
 * digest. Different policy values DO.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRECEDENCE_AUTHORITY_POLICY, policyDigest } from '../dist/index.js';

describe('policyDigest', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const d = policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY);
    assert.match(d, /^[0-9a-f]{64}$/);
  });

  it('reproducible — same policy returns same digest', () => {
    const a = policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY);
    const b = policyDigest({ ...DEFAULT_PRECEDENCE_AUTHORITY_POLICY });
    assert.equal(a, b);
  });

  it('key-order-stable — reordered object keys yield same digest', () => {
    const reordered = {
      respectEnrollmentLock: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectEnrollmentLock,
      respectActivePause: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectActivePause,
      respectHandoffAgentLed: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectHandoffAgentLed,
      respectFirstTouchWindow: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.respectFirstTouchWindow,
      exemptIntensities: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.exemptIntensities,
      exemptFlowTypes: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.exemptFlowTypes,
      preemptCooldownHours: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.preemptCooldownHours,
      signalRecencyMaxHours: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.signalRecencyMaxHours,
      minPreemptPriority: DEFAULT_PRECEDENCE_AUTHORITY_POLICY.minPreemptPriority,
    };
    assert.equal(
      policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY),
      policyDigest(reordered),
    );
  });

  it('array-order-stable — reordered exemptFlowTypes yields same digest', () => {
    const reordered = {
      ...DEFAULT_PRECEDENCE_AUTHORITY_POLICY,
      exemptFlowTypes: ['client_care', 'mid_transaction'],
    };
    assert.equal(
      policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY),
      policyDigest(reordered),
    );
  });

  it('value-sensitive — changed minPreemptPriority yields different digest', () => {
    const tightened = {
      ...DEFAULT_PRECEDENCE_AUTHORITY_POLICY,
      minPreemptPriority: 'CRITICAL',
    };
    assert.notEqual(
      policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY),
      policyDigest(tightened),
    );
  });

  it('value-sensitive — added exemptFlowType yields different digest', () => {
    const extended = {
      ...DEFAULT_PRECEDENCE_AUTHORITY_POLICY,
      exemptFlowTypes: ['mid_transaction', 'client_care', 'tenant_custom_flow'],
    };
    assert.notEqual(
      policyDigest(DEFAULT_PRECEDENCE_AUTHORITY_POLICY),
      policyDigest(extended),
    );
  });
});
