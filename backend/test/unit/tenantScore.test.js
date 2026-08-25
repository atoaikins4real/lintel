// Tenant scoring + lifecycle tier logic. Deliberately transparent so a
// manager can explain a tier to a tenant — these tests pin the weights and
// the tier thresholds from the feature spec.
const { TIERS, computeScore, computeTier, isUpgradeEligible } = require('../../src/utils/tenantScore');

describe('computeScore', () => {
  it('is 0 for a brand-new tenant with no stays and (defaulted) perfect punctuality gives payment weight only... ', () => {
    // With all-defaults except no stays: onTimePaymentRate defaults to 100 => 50 pts,
    // no stays => no stay/tenure/baseline points, no faults.
    expect(computeScore({ totalStays: 0 })).toBe(50);
  });

  it('awards the full 100 for a long-tenured, punctual, fault-free resident', () => {
    const score = computeScore({
      totalStays: 5,
      onTimePaymentRate: 100,
      tenantCausedFaults: 0,
      longestContinuousMonths: 12,
    });
    // 50 (punctual) + 25 (5 stays) + 15 (12mo) + 10 (baseline) = 100
    expect(score).toBe(100);
  });

  it('weights payment punctuality most heavily (50 pts)', () => {
    const punctual = computeScore({ totalStays: 0, onTimePaymentRate: 100 });
    const never = computeScore({ totalStays: 0, onTimePaymentRate: 0 });
    expect(punctual - never).toBe(50);
  });

  it('caps stay points at 5 stays (diminishing returns)', () => {
    const five = computeScore({ totalStays: 5, onTimePaymentRate: 0 });
    const ten = computeScore({ totalStays: 10, onTimePaymentRate: 0 });
    expect(five).toBe(ten); // 25 (capped) + 10 baseline
    expect(five).toBe(35);
  });

  it('penalises tenant-caused faults up to -20', () => {
    const clean = computeScore({ totalStays: 5, onTimePaymentRate: 100, longestContinuousMonths: 12 });
    const faulty = computeScore({
      totalStays: 5,
      onTimePaymentRate: 100,
      longestContinuousMonths: 12,
      tenantCausedFaults: 10, // 10*4=40, capped at 20
    });
    expect(clean - faulty).toBe(20);
  });

  it('never returns below 0 or above 100', () => {
    expect(computeScore({ totalStays: 0, onTimePaymentRate: 0, tenantCausedFaults: 100 })).toBe(0);
    expect(computeScore({ totalStays: 99, onTimePaymentRate: 100, longestContinuousMonths: 999 })).toBe(100);
  });
});

describe('computeTier', () => {
  it('Guest for a first-timer', () => {
    expect(computeTier({ totalStays: 1, longestContinuousMonths: 0, score: 50 })).toBe(TIERS.GUEST);
  });

  it('Returning after a second stay', () => {
    expect(computeTier({ totalStays: 2, longestContinuousMonths: 0, score: 40 })).toBe(TIERS.RETURNING);
  });

  it('Resident once continuously tenanted 12+ months', () => {
    expect(computeTier({ totalStays: 1, longestContinuousMonths: 12, score: 60 })).toBe(TIERS.RESIDENT);
  });

  it('Exclusive requires a strong score AND long tenure or many stays', () => {
    expect(computeTier({ totalStays: 5, longestContinuousMonths: 0, score: 80 })).toBe(TIERS.EXCLUSIVE);
    expect(computeTier({ totalStays: 1, longestContinuousMonths: 12, score: 80 })).toBe(TIERS.EXCLUSIVE);
    // Strong score but neither tenure nor stay-count threshold -> not Exclusive
    expect(computeTier({ totalStays: 1, longestContinuousMonths: 3, score: 90 })).not.toBe(TIERS.EXCLUSIVE);
  });
});

describe('isUpgradeEligible', () => {
  it('flags a strong, punctual, repeat tenant not yet Exclusive', () => {
    expect(
      isUpgradeEligible({ tier: TIERS.RESIDENT, score: 75, totalStays: 3, onTimePaymentRate: 95 })
    ).toBe(true);
  });

  it('never flags a tenant already Exclusive', () => {
    expect(
      isUpgradeEligible({ tier: TIERS.EXCLUSIVE, score: 100, totalStays: 9, onTimePaymentRate: 100 })
    ).toBe(false);
  });

  it('requires score >= 70, punctuality >= 90, and 3+ stays', () => {
    expect(isUpgradeEligible({ tier: TIERS.RETURNING, score: 69, totalStays: 3, onTimePaymentRate: 95 })).toBe(false);
    expect(isUpgradeEligible({ tier: TIERS.RETURNING, score: 80, totalStays: 3, onTimePaymentRate: 89 })).toBe(false);
    expect(isUpgradeEligible({ tier: TIERS.RETURNING, score: 80, totalStays: 2, onTimePaymentRate: 95 })).toBe(false);
  });
});
