// ─────────────────────────────────────────────────────────────────────────
// The Lintel "operating system" catalog.
//
// A company picks a role at sign-up (landlord | hotelier | shortlet | agent).
// That one choice is the DECIDING FACTOR for the whole app: it decides which
// modules ("apps") exist, what they are called, how they are grouped, and what
// you can create. This file is that single source of truth — the left rail,
// the home app-launcher, the ⌘K command palette and the global + quick-add
// menu all read from here, so they can never drift apart.
//
// Each leaf carries:
//   to     route
//   label  what this role calls it
//   icon   rail / launcher glyph
//   desc   one line for the launcher + palette (optional)
//   perm   permission a worker needs to see it (optional → always visible)
//   primary / mobileTo / end / children — rail + mobile-bar layout hints
// ─────────────────────────────────────────────────────────────────────────
import {
  IconGrid, IconUsers, IconFile, IconWallet, IconWrench, IconChart,
  IconCog, IconShield, IconKey, IconHome, IconBuilding, IconCalendar, IconSparkle,
} from '../components/icons.jsx';

// ── Landlord (long-let) ──────────────────────────────────────────────────
const landlordNav = [
  { to: '/', label: 'Home', end: true, icon: IconGrid, primary: true },
  { label: 'People', icon: IconUsers, primary: true, mobileTo: '/tenants', children: [
    { to: '/tenants', label: 'Residents', icon: IconUsers, perm: 'people.view', desc: 'Everyone renting from you' },
    { to: '/staff', label: 'Team', icon: IconShield, perm: 'staff.manage', desc: 'Workers and their access' },
  ] },
  { label: 'Homes', icon: IconHome, primary: true, mobileTo: '/properties', children: [
    { to: '/properties', label: 'Buildings', icon: IconHome, perm: 'buildings.view', desc: 'Your properties' },
    { to: '/units', label: 'Apartments', icon: IconBuilding, perm: 'rooms.view', desc: 'Individual homes to let' },
  ] },
  { label: 'Rentals', icon: IconWallet, primary: true, mobileTo: '/payments', children: [
    { to: '/leases', label: 'Tenancies', icon: IconFile, perm: 'leases.view', desc: 'Active and past lease agreements' },
    { to: '/payments', label: 'Payments', icon: IconWallet, perm: 'payments.view', desc: 'Rent collected and due' },
  ] },
  { label: 'Upkeep', icon: IconWrench, mobileTo: '/faults-renovations', children: [
    { to: '/access', label: 'Access cards', icon: IconKey, perm: 'access.view', desc: 'Keys and entry cards' },
    { to: '/faults-renovations', label: 'Repairs', icon: IconWrench, perm: 'repairs.view', desc: 'Faults and renovations' },
    { to: '/booking-requests', label: 'Enquiries', icon: IconCalendar, perm: 'enquiries.view', desc: 'Requests from your public page' },
  ] },
  { to: '/reports', label: 'Reports', icon: IconChart, primary: true, perm: 'reports.view', desc: 'Income, occupancy and trends' },
  { to: '/settings', label: 'Settings', icon: IconCog, desc: 'Branding, plan and preferences' },
];

// ── Hotelier (hotel / guest house) ───────────────────────────────────────
const hotelNav = [
  { to: '/', label: 'Home', end: true, icon: IconGrid, primary: true },
  { to: '/reservations', label: 'Reservations', icon: IconCalendar, primary: true, perm: 'reservations.view', desc: 'Arrivals, stays and departures' },
  { to: '/rooms', label: 'Rooms', icon: IconBuilding, primary: true, perm: 'rooms.view', desc: 'Your rooms and their status' },
  { to: '/tenants', label: 'Guests', icon: IconUsers, primary: true, perm: 'people.view', desc: 'Guest profiles and history' },
  { to: '/housekeeping', label: 'Housekeeping', icon: IconSparkle, perm: 'housekeeping.view', desc: 'Room cleaning board' },
  { to: '/payments', label: 'Payments', icon: IconWallet, primary: true, perm: 'payments.view', desc: 'Charges and settlements' },
  { to: '/staff', label: 'Team', icon: IconShield, perm: 'staff.manage', desc: 'Workers and their access' },
  { label: 'Upkeep', icon: IconWrench, mobileTo: '/faults-renovations', children: [
    { to: '/access', label: 'Access cards', icon: IconKey, perm: 'access.view', desc: 'Keys and entry cards' },
    { to: '/faults-renovations', label: 'Repairs', icon: IconWrench, perm: 'repairs.view', desc: 'Faults and maintenance' },
  ] },
  { to: '/reports', label: 'Reports', icon: IconChart, perm: 'reports.view', desc: 'Occupancy, revenue and trends' },
  { to: '/settings', label: 'Settings', icon: IconCog, desc: 'Branding, plan and preferences' },
];

// ── Short-let / Airbnb host ──────────────────────────────────────────────
const shortletNav = [
  { to: '/', label: 'Home', end: true, icon: IconGrid, primary: true },
  { to: '/reservations', label: 'Calendar', icon: IconCalendar, primary: true, perm: 'reservations.view', desc: 'Your booking calendar' },
  { to: '/rooms', label: 'Listings', icon: IconBuilding, primary: true, perm: 'rooms.view', desc: 'The places you host' },
  { to: '/tenants', label: 'Guests', icon: IconUsers, primary: true, perm: 'people.view', desc: 'Guest profiles and history' },
  { to: '/payments', label: 'Payouts', icon: IconWallet, primary: true, perm: 'payments.view', desc: 'What you have earned' },
  { to: '/staff', label: 'Team', icon: IconShield, perm: 'staff.manage', desc: 'Co-hosts and their access' },
  { label: 'Upkeep', icon: IconWrench, mobileTo: '/faults-renovations', children: [
    { to: '/access', label: 'Access & keys', icon: IconKey, perm: 'access.view', desc: 'Lockbox codes and keys' },
    { to: '/housekeeping', label: 'Housekeeping', icon: IconSparkle, perm: 'housekeeping.view', desc: 'Turnover cleaning board' },
    { to: '/faults-renovations', label: 'Repairs', icon: IconWrench, perm: 'repairs.view', desc: 'Faults and maintenance' },
  ] },
  { to: '/reports', label: 'Reports', icon: IconChart, perm: 'reports.view', desc: 'Earnings and occupancy' },
  { to: '/settings', label: 'Settings', icon: IconCog, desc: 'Branding, plan and preferences' },
];

// ── Real-estate agent (sales) ────────────────────────────────────────────
const agentNav = [
  { to: '/', label: 'Home', end: true, icon: IconGrid, primary: true },
  { label: 'Listings', icon: IconHome, primary: true, mobileTo: '/units', children: [
    { to: '/units', label: 'For sale', icon: IconBuilding, perm: 'rooms.view', desc: 'Properties on the market' },
    { to: '/properties', label: 'Developments', icon: IconHome, perm: 'buildings.view', desc: 'Schemes and estates' },
  ] },
  { to: '/booking-requests', label: 'Enquiries', icon: IconCalendar, primary: true, perm: 'enquiries.view', desc: 'Buyer enquiries and offers' },
  { to: '/tenants', label: 'Contacts', icon: IconUsers, primary: true, perm: 'people.view', desc: 'Buyers, sellers and leads' },
  { to: '/staff', label: 'Team', icon: IconShield, perm: 'staff.manage', desc: 'Agents and their access' },
  { to: '/reports', label: 'Reports', icon: IconChart, primary: true, perm: 'reports.view', desc: 'Pipeline and performance' },
  { to: '/settings', label: 'Settings', icon: IconCog, desc: 'Branding, plan and preferences' },
];

// Defined AFTER all four arrays so each is fully initialised first —
// referencing a `const` before its own line yields undefined, which once made
// hoteliers fall back to the landlord nav.
export const NAV_BY_ROLE = {
  landlord: landlordNav,
  hotelier: hotelNav,
  shortlet: shortletNav,
  agent: agentNav,
};

// The permission each route needs, derived from the catalog so the rail, the
// launcher and the palette all gate identically. Home and Settings are always
// shown (Settings gates its own sections inside).
export const PATH_PERM = (() => {
  const map = {};
  Object.values(NAV_BY_ROLE).forEach((nav) =>
    nav.forEach((it) =>
      (it.children || [it]).forEach((leaf) => {
        if (leaf.to && leaf.perm) map[leaf.to] = leaf.perm;
      })
    )
  );
  return map;
})();

// Flatten a role's nav into its launchable "apps" — every leaf except Home
// (which is the launcher itself). Used by ⌘K and the search index.
export function roleApps(role) {
  const nav = NAV_BY_ROLE[role] || landlordNav;
  return nav
    .flatMap((it) => (it.children ? it.children : [it]))
    .filter((leaf) => leaf.to && leaf.to !== '/');
}

// The five most-relevant apps per role for the home dock — the day-to-day ones,
// in priority order. Everything else stays one tap away in the rail and ⌘K, so
// the dashboard stays tidy. Any dock app a worker can't access is dropped.
const DOCK = {
  landlord: ['/tenants', '/units', '/leases', '/payments', '/faults-renovations'],
  hotelier: ['/reservations', '/rooms', '/tenants', '/housekeeping', '/payments'],
  shortlet: ['/reservations', '/rooms', '/tenants', '/payments', '/housekeeping'],
  agent: ['/units', '/booking-requests', '/tenants', '/properties', '/reports'],
};
export function dockApps(role) {
  const apps = roleApps(role);
  const order = DOCK[role] || DOCK.landlord;
  return order.map((to) => apps.find((a) => a.to === to)).filter(Boolean);
}

// ── Global quick-add (＋) — what this role can create from anywhere ────────
// `perm` gates each action; a member without it simply doesn't see it.
const QUICK_ADD = {
  landlord: [
    { to: '/units/onboard', label: 'Add an apartment', icon: IconBuilding, perm: 'rooms.manage' },
    { to: '/tenants/onboard', label: 'Add a resident', icon: IconUsers, perm: 'people.manage' },
    { to: '/properties/onboard', label: 'Add a building', icon: IconHome, perm: 'buildings.manage' },
    { to: '/payments', label: 'Record a payment', icon: IconWallet, perm: 'payments.manage' },
    { to: '/faults-renovations', label: 'Log a repair', icon: IconWrench, perm: 'repairs.manage' },
  ],
  hotelier: [
    { to: '/reservations', label: 'New reservation', icon: IconCalendar, perm: 'reservations.manage' },
    { to: '/tenants/onboard', label: 'Add a guest', icon: IconUsers, perm: 'people.manage' },
    { to: '/units/onboard', label: 'Add a room', icon: IconBuilding, perm: 'rooms.manage' },
    { to: '/payments', label: 'Record a payment', icon: IconWallet, perm: 'payments.manage' },
    { to: '/faults-renovations', label: 'Log a repair', icon: IconWrench, perm: 'repairs.manage' },
  ],
  shortlet: [
    { to: '/reservations', label: 'New booking', icon: IconCalendar, perm: 'reservations.manage' },
    { to: '/tenants/onboard', label: 'Add a guest', icon: IconUsers, perm: 'people.manage' },
    { to: '/units/onboard', label: 'Add a listing', icon: IconBuilding, perm: 'rooms.manage' },
    { to: '/payments', label: 'Record a payout', icon: IconWallet, perm: 'payments.manage' },
  ],
  agent: [
    { to: '/units/onboard', label: 'Add a listing', icon: IconBuilding, perm: 'rooms.manage' },
    { to: '/properties/onboard', label: 'Add a development', icon: IconHome, perm: 'buildings.manage' },
    { to: '/tenants/onboard', label: 'Add a contact', icon: IconUsers, perm: 'people.manage' },
    { to: '/booking-requests', label: 'Review enquiries', icon: IconCalendar, perm: 'enquiries.view' },
  ],
};

export function quickAddActions(role) {
  return QUICK_ADD[role] || QUICK_ADD.landlord;
}

// ── Role hero imagery ────────────────────────────────────────────────────
// Each role's dashboard leads with a photo that represents what it manages.
// `src` is a royalty-free hotlink (Unsplash); `fallback` is a bundled image so
// the hero is never broken if the network blocks the CDN. Swap `src` for your
// own brand photo any time — nothing else needs to change.
const U = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;
export const ROLE_HERO = {
  landlord: {
    src: U('photo-1460317442991-0ec209397118'), fallback: '/bg1.jpg',
    eyebrow: 'Homes · Residents · Rent', alt: 'Residential apartment building',
    tagline: 'Your buildings, residents and rent — all in one place.',
  },
  hotelier: {
    src: U('photo-1564501049412-61c2a3083791'), fallback: '/app1.jpg',
    eyebrow: 'Rooms · Reservations · Guests', alt: 'Aerial view of a hotel resort and pool',
    tagline: 'Your front desk, from arrivals to payments.',
  },
  shortlet: {
    src: U('photo-1522771739844-6a9f6d5f14af'), fallback: '/app.jfif',
    eyebrow: 'Listings · Calendar · Guests', alt: 'Modern minimalist room',
    tagline: 'Your calendar, guests and payouts at a glance.',
  },
  agent: {
    src: U('photo-1600585154340-be6161a56a0c'), fallback: '/app1.jfif',
    eyebrow: 'Listings · Enquiries · Contacts', alt: 'Modern house for sale',
    tagline: 'Your listings, buyer enquiries and pipeline.',
  },
};
export function roleHero(role) {
  return ROLE_HERO[role] || ROLE_HERO.landlord;
}

// Each main role has its own identity colour, so the four verticals feel like
// distinct interfaces out of the box — a hotel reads teal, a short-let coral,
// an agent green, a landlord gold. This is only the DEFAULT: an organisation's
// own brand colour (Settings → branding) overrides it everywhere, which is how
// a subscriber brands their workspace. One knob, two outcomes.
export const ROLE_ACCENT = {
  landlord: '#b07d2b', // warm gold — homes & rent
  hotelier: '#15746e', // teal — hospitality
  shortlet: '#d9544d', // coral — hosting
  agent: '#2f7d55',    // emerald — real estate
};
export function roleAccent(role) {
  return ROLE_ACCENT[role] || ROLE_ACCENT.landlord;
}

// Record types each role can search from the dashboard, mapped to their detail
// route and the role's word for them. Consumed by the search index hook.
export const RECORD_SOURCES = {
  landlord: [
    { type: 'tenants', kind: 'Resident', perm: 'people.view', to: (r) => `/tenants/${r.id}` },
    { type: 'units', kind: 'Apartment', perm: 'rooms.view', to: (r) => `/units/${r.id}` },
    { type: 'properties', kind: 'Building', perm: 'buildings.view', to: (r) => `/properties/${r.id}` },
  ],
  hotelier: [
    { type: 'tenants', kind: 'Guest', perm: 'people.view', to: (r) => `/tenants/${r.id}` },
    { type: 'units', kind: 'Room', perm: 'rooms.view', to: (r) => `/units/${r.id}` },
  ],
  shortlet: [
    { type: 'tenants', kind: 'Guest', perm: 'people.view', to: (r) => `/tenants/${r.id}` },
    { type: 'units', kind: 'Listing', perm: 'rooms.view', to: (r) => `/units/${r.id}` },
  ],
  agent: [
    { type: 'tenants', kind: 'Contact', perm: 'people.view', to: (r) => `/tenants/${r.id}` },
    { type: 'units', kind: 'Listing', perm: 'rooms.view', to: (r) => `/units/${r.id}` },
    { type: 'properties', kind: 'Development', perm: 'buildings.view', to: (r) => `/properties/${r.id}` },
  ],
};
