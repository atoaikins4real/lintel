// A company picks a role at sign-up (stored on l_companies.business_type).
// This is the single source of truth that maps that stored value to a concrete
// role and carries the words each role needs. Older accounts stored only
// 'rental' / 'hospitality' — those alias onto landlord / hotelier so nothing
// created before the role picker breaks.

export const ROLE_KEYS = ['landlord', 'hotelier', 'shortlet', 'agent'];

const ALIASES = { rental: 'landlord', hospitality: 'hotelier' };

export function resolveRole(businessType) {
  const v = String(businessType || '').toLowerCase().trim();
  if (ROLE_KEYS.includes(v)) return v;
  return ALIASES[v] || 'landlord';
}

// Roles that run the stay / booking side of the app — rooms (l_units),
// reservations and a guest register. Hotels and short-let hosts share this
// machinery; long-let landlords and sales agents do not.
export const STAY_ROLES = ['hotelier', 'shortlet'];
export function isStayRole(role) {
  return STAY_ROLES.includes(resolveRole(role));
}

// Short, human labels for each role — used on the account menu and settings.
export const ROLE_LABELS = {
  landlord: 'Landlord',
  hotelier: 'Hotelier',
  shortlet: 'Short-let host',
  agent: 'Estate agent',
};
