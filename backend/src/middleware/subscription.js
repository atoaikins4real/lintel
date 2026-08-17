// SUBSCRIPTION ENFORCEMENT
//
// Design principles, because getting this wrong locks paying customers
// out of their own business records:
//
//  1. NEVER block reads. A lapsed subscriber can always see their
//     tenants, leases and payments. Withholding someone's own data to
//     extract payment is not acceptable; degrading to read-only is.
//  2. Grace period after the due date, so a payment landing a day late
//     or a date typo doesn't immediately break someone's operations.
//  3. Missing dates never expire. A subscription with no renews_on is
//     treated as fine, not as overdue — absence of data is not evidence
//     of non-payment.
//  4. Platform admins are never restricted, so the operator can't lock
//     themselves out of their own tool.
//  5. Failures are open, not closed. If the subscription lookup errors,
//     the request proceeds — an outage in this check must not take every
//     customer's account down with it.
const { supabase } = require('../config/supabase');

// Days after the due date before writes are actually blocked.
const GRACE_DAYS = 7;

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(toIso) - new Date(fromIso)) / 86400000);
}

/**
 * Works out a subscription's standing. Exported so the same logic drives
 * both enforcement and the warning banner — the UI can never disagree
 * with what the API will actually do.
 */
function evaluate(subscription, today = new Date().toISOString().slice(0, 10)) {
  if (!subscription) {
    // No subscription row at all — don't punish someone for a gap in our
    // own data.
    return { state: 'ok', writable: true, reason: null, days_left: null };
  }

  const { status, trial_ends_on, renews_on } = subscription;

  if (status === 'cancelled') {
    return {
      state: 'cancelled',
      writable: false,
      reason: 'This subscription has been cancelled. Your records stay readable — contact Lintel to reactivate.',
      days_left: null,
    };
  }

  // The date that matters for this status.
  const dueDate = status === 'trial' ? trial_ends_on : renews_on;

  // Principle 3: no date means no expiry.
  if (!dueDate) return { state: 'ok', writable: true, reason: null, days_left: null };

  const daysLeft = daysBetween(today, dueDate);

  if (daysLeft >= 0) {
    return {
      state: daysLeft <= 7 ? 'due_soon' : 'ok',
      writable: true,
      reason: null,
      days_left: daysLeft,
    };
  }

  const daysOverdue = -daysLeft;
  if (daysOverdue <= GRACE_DAYS) {
    return {
      state: 'grace',
      writable: true,
      reason: null,
      days_left: daysLeft,
      grace_days_left: GRACE_DAYS - daysOverdue,
    };
  }

  return {
    state: status === 'trial' ? 'trial_expired' : 'lapsed',
    writable: false,
    reason:
      status === 'trial'
        ? 'Your free trial has ended. Everything stays readable — contact Lintel to choose a plan and start adding records again.'
        : 'This subscription is past due. Everything stays readable — settle the balance to start adding records again.',
    days_left: daysLeft,
  };
}

/**
 * Express middleware. Attaches req.subscriptionState for downstream use
 * and blocks writes when the subscription is no longer in good standing.
 */
async function enforceSubscription(req, res, next) {
  try {
    // Principle 4.
    if (req.user?.is_platform_admin) return next();
    if (!req.user?.company_id) return next();

    // Principle 1 — reads are never blocked, so don't even look it up.
    if (!WRITE_METHODS.includes(req.method)) return next();

    const { data, error } = await supabase
      .from('l_subscriptions')
      .select('status, trial_ends_on, renews_on')
      .eq('company_id', req.user.company_id)
      .maybeSingle();

    // Principle 5 — fail open.
    if (error) {
      console.error('Subscription check failed, allowing request through:', error.message);
      return next();
    }

    const state = evaluate(data);
    req.subscriptionState = state;

    if (!state.writable) {
      return res.status(402).json({
        error: state.reason,
        subscription_state: state.state,
        read_only: true,
      });
    }

    next();
  } catch (err) {
    // Principle 5 again — never let this middleware be the reason an
    // account stops working.
    console.error('Subscription check threw, allowing request through:', err?.message || err);
    next();
  }
}

module.exports = { enforceSubscription, evaluate, GRACE_DAYS };
