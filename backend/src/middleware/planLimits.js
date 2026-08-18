// PLAN LIMITS
//
// Blocks creating NEW records beyond a plan's allowance. Deliberately
// never touches what already exists: if a subscriber is downgraded below
// their current usage, nothing is deleted, hidden or broken — they simply
// can't add more until they upgrade or remove some. Punishing someone by
// hiding data they already entered would be worse than useless.
//
// Only applies to creates (POST). Edits and deletes always work, so a
// subscriber over their limit can still fix and tidy their records.
const { supabase } = require('../config/supabase');

// resource -> { table, planField, label }
const LIMITS = {
  properties: { table: 'l_properties', planField: 'max_properties', label: 'properties' },
  units: { table: 'l_units', planField: 'max_units', label: 'units' },
  tenants: { table: 'l_tenants', planField: 'max_tenants', label: 'tenants' },
  staff: { table: 'l_users', planField: 'max_staff', label: 'staff accounts' },
};

/**
 * Returns middleware enforcing the limit for one resource.
 * Fails open on any error — a lookup problem must not stop a customer
 * working.
 */
function enforcePlanLimit(resource) {
  const config = LIMITS[resource];
  if (!config) throw new Error(`Unknown plan-limited resource: ${resource}`);

  return async (req, res, next) => {
    try {
      if (req.method !== 'POST') return next();

      // Only the collection root creates a new record. Sub-resource POSTs
      // under the same router — /tenants/:id/recompute, /:id/tier-events —
      // must not be blocked by a limit, since they add nothing countable
      // and blocking them would break maintenance for anyone at capacity.
      if (req.path !== '/' && req.path !== '') return next();

      if (req.user?.is_platform_admin) return next();
      if (!req.user?.company_id) return next();

      const { data: sub, error: subErr } = await supabase
        .from('l_subscriptions')
        .select('l_plans(name, ' + config.planField + ')')
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      if (subErr) throw subErr;

      const plan = sub?.l_plans;
      const limit = plan?.[config.planField];

      // No plan, or null limit, means unlimited.
      if (limit === null || limit === undefined) return next();

      const { count, error: countErr } = await supabase
        .from(config.table)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', req.user.company_id);
      if (countErr) throw countErr;

      if ((count || 0) >= limit) {
        return res.status(402).json({
          error: `Your ${plan.name} plan includes up to ${limit} ${config.label}, and you're at ${count}. Contact Lintel to upgrade — nothing you've already added is affected.`,
          limit_reached: config.label,
          limit,
          current: count,
        });
      }

      next();
    } catch (err) {
      console.error(`Plan limit check for ${resource} failed, allowing request:`, err?.message || err);
      next();
    }
  };
}

module.exports = { enforcePlanLimit };
