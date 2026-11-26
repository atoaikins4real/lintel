// The permission catalog — the single list of things a worker can be allowed
// to see or do. A custom role is just a chosen subset of these keys. Keys are
// module.action; `view` gates seeing a section, `manage` gates changing it.
// Keep this in step with the backend copy in utils/permissions.js.
export const PERMISSION_GROUPS = [
  { module: 'Front desk & stays', perms: [
    ['reservations.view', 'See reservations / calendar'],
    ['reservations.manage', 'Book, check in & check out'],
    ['housekeeping.view', 'See housekeeping board'],
    ['housekeeping.manage', 'Update room cleaning status'],
  ] },
  { module: 'Rooms & properties', perms: [
    ['rooms.view', 'See rooms / apartments / listings'],
    ['rooms.manage', 'Add & edit rooms / apartments'],
    ['buildings.view', 'See buildings / developments'],
    ['buildings.manage', 'Add & edit buildings'],
  ] },
  { module: 'People', perms: [
    ['people.view', 'See guests / residents / contacts'],
    ['people.manage', 'Add & edit people'],
    ['leases.view', 'See tenancies'],
    ['leases.manage', 'Create & edit tenancies'],
  ] },
  { module: 'Money', perms: [
    ['payments.view', 'See payments'],
    ['payments.manage', 'Record & edit payments'],
    ['expenses.view', 'See expenses'],
    ['expenses.manage', 'Record & edit expenses'],
    ['reports.view', 'See reports & P&L'],
  ] },
  { module: 'Upkeep', perms: [
    ['repairs.view', 'See repairs'],
    ['repairs.manage', 'Log & update repairs'],
    ['access.view', 'See access cards'],
    ['access.manage', 'Issue access cards'],
    ['enquiries.view', 'See public enquiries'],
    ['enquiries.manage', 'Respond to enquiries'],
  ] },
  { module: 'Administration', perms: [
    ['staff.manage', 'Add & manage workers'],
    ['roles.manage', 'Create & edit roles'],
    ['settings.manage', 'Change company settings'],
    ['billing.manage', 'Manage subscription & billing'],
  ] },
];

export const ALL_PERMS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p[0]));
export const PERM_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.perms));

// Starting points when creating a role, per vertical. [name, [permission keys]].
export const ROLE_TEMPLATES = {
  hotelier: [
    ['Front desk', ['reservations.view', 'reservations.manage', 'people.view', 'people.manage', 'payments.view', 'payments.manage', 'housekeeping.view']],
    ['Housekeeping', ['housekeeping.view', 'housekeeping.manage', 'repairs.view', 'repairs.manage']],
    ['Accountant', ['payments.view', 'payments.manage', 'expenses.view', 'expenses.manage', 'reports.view']],
    ['Concierge', ['reservations.view', 'people.view', 'enquiries.view', 'enquiries.manage']],
    ['Maintenance', ['repairs.view', 'repairs.manage', 'access.view', 'access.manage', 'housekeeping.view']],
  ],
  landlord: [
    ['Leasing agent', ['buildings.view', 'rooms.view', 'people.view', 'people.manage', 'leases.view', 'leases.manage', 'enquiries.view', 'enquiries.manage']],
    ['Accountant', ['payments.view', 'payments.manage', 'expenses.view', 'expenses.manage', 'reports.view']],
    ['Maintenance', ['repairs.view', 'repairs.manage', 'access.view', 'access.manage']],
  ],
  shortlet: [
    ['Co-host', ['reservations.view', 'reservations.manage', 'people.view', 'people.manage', 'rooms.view']],
    ['Cleaner', ['housekeeping.view', 'housekeeping.manage']],
  ],
  agent: [
    ['Agent', ['rooms.view', 'rooms.manage', 'people.view', 'people.manage', 'enquiries.view', 'enquiries.manage']],
    ['Coordinator', ['rooms.view', 'people.view', 'enquiries.view', 'buildings.view']],
  ],
};

// A plain "Member" with no custom role keeps broad access to everything except
// the administration keys — this preserves the old finance-role behaviour.
export const DEFAULT_MEMBER_PERMS = ALL_PERMS.filter(
  (k) => !['staff.manage', 'roles.manage', 'settings.manage', 'billing.manage'].includes(k)
);
