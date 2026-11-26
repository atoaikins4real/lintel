// Backend copy of the permission catalog (keep in step with the frontend
// config/permissions.js). A worker's "effective permissions" are computed
// live from their base role and any custom role assigned to them.
const { supabase } = require('../config/supabase');

const ALL_PERMS = [
  'reservations.view', 'reservations.manage',
  'housekeeping.view', 'housekeeping.manage',
  'rooms.view', 'rooms.manage',
  'buildings.view', 'buildings.manage',
  'people.view', 'people.manage',
  'leases.view', 'leases.manage',
  'payments.view', 'payments.manage',
  'expenses.view', 'expenses.manage',
  'reports.view',
  'repairs.view', 'repairs.manage',
  'access.view', 'access.manage',
  'enquiries.view', 'enquiries.manage',
  'staff.manage', 'roles.manage', 'settings.manage', 'billing.manage',
];

const ADMIN_KEYS = ['staff.manage', 'roles.manage', 'settings.manage', 'billing.manage'];
// A plain Member with no custom role keeps broad access to everything except
// the administration keys — preserves the previous finance-role behaviour.
const DEFAULT_MEMBER_PERMS = ALL_PERMS.filter((k) => !ADMIN_KEYS.includes(k));

// Resolve what a user is allowed to do:
//  - the Lintel operator and any company manager get everything;
//  - a member with a custom role gets exactly that role's keys;
//  - a member with no custom role gets the default broad set.
async function permissionsForUser(user) {
  if (!user) return [];
  if (user.is_platform_admin === true || user.role === 'manager') return ALL_PERMS;
  if (user.custom_role_id) {
    const { data } = await supabase
      .from('l_roles')
      .select('permissions')
      .eq('id', user.custom_role_id)
      .maybeSingle();
    return Array.isArray(data?.permissions) ? data.permissions.filter((k) => ALL_PERMS.includes(k)) : [];
  }
  return DEFAULT_MEMBER_PERMS;
}

module.exports = { ALL_PERMS, DEFAULT_MEMBER_PERMS, permissionsForUser };
