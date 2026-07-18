/**
 * Tenant scoring + lifecycle tier logic.
 *
 * Score (0-100) blends payment punctuality, tenure/stay count, and
 * fault history. This is intentionally simple and transparent so
 * managers can explain a tenant's tier to them — a black-box score
 * would undermine the "upgrade offer" moment.
 */

const TIERS = {
  GUEST: 'guest',
  RETURNING: 'returning',
  RESIDENT: 'resident',
  EXCLUSIVE: 'exclusive',
};

/**
 * @param {Object} stats
 * @param {number} stats.totalStays
 * @param {number} stats.onTimePaymentRate - 0-100
 * @param {number} stats.tenantCausedFaults - count of faults caused_by tenant
 * @param {number} stats.longestContinuousMonths - longest continuous long-stay lease, in months
 */
function computeScore({
  totalStays = 0,
  onTimePaymentRate = 100,
  tenantCausedFaults = 0,
  longestContinuousMonths = 0,
}) {
  let score = 0;

  // Payment punctuality is the heaviest weight — 50 points.
  score += (onTimePaymentRate / 100) * 50;

  // Stay history — up to 25 points, diminishing returns after 5 stays.
  score += Math.min(totalStays, 5) * 5;

  // Tenure bonus — up to 15 points for 12+ continuous months.
  score += Math.min(longestContinuousMonths / 12, 1) * 15;

  // Fault penalty — up to -20 points, 4 points per tenant-caused fault.
  score -= Math.min(tenantCausedFaults * 4, 20);

  // Baseline 10 points for having any completed stay at all.
  if (totalStays > 0) score += 10;

  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

/**
 * Determines lifecycle tier from stay count, tenure, and score.
 * Mirrors the tiers from the Lintel feature spec:
 *   Guest -> Returning -> Resident -> Exclusive
 */
function computeTier({ totalStays = 0, longestContinuousMonths = 0, score = 0 }) {
  if (score >= 75 && (longestContinuousMonths >= 12 || totalStays >= 5)) {
    return TIERS.EXCLUSIVE;
  }
  if (longestContinuousMonths >= 12) {
    return TIERS.RESIDENT;
  }
  if (totalStays >= 2) {
    return TIERS.RETURNING;
  }
  return TIERS.GUEST;
}

/**
 * A tenant is flagged as upgrade-eligible when they've crossed into
 * Resident/Returning territory with a strong score but haven't yet
 * been offered (or haven't accepted) an Exclusive-tier incentive.
 */
function isUpgradeEligible({ tier, score, totalStays, onTimePaymentRate }) {
  if (tier === TIERS.EXCLUSIVE) return false;
  return score >= 70 && onTimePaymentRate >= 90 && totalStays >= 3;
}

module.exports = { TIERS, computeScore, computeTier, isUpgradeEligible };
