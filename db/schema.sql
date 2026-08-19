-- ============================================================
-- LINTEL — Real Estate Management Platform
-- Database Schema (PostgreSQL / Supabase)
-- ============================================================
-- This schema is designed to live inside a SHARED Supabase project
-- (alongside other Vieve products, e.g. Tractor). Every table, type,
-- function, trigger, and index is prefixed with `l_` so it can never
-- collide with another product's schema in the same database.
--
-- Run this in the Supabase SQL editor (or `psql`) to create the
-- full Lintel schema. Safe to re-run — uses IF NOT EXISTS / OR
-- REPLACE / DROP...IF EXISTS guards throughout.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- MULTI-TENANCY
-- Every business table carries a company_id. A company is one
-- subscriber: their units, tenants, leases, payments, staff and
-- settings are invisible to every other company.
--
-- Isolation is enforced in the API layer — each request filters by the
-- company_id carried in the caller's signed JWT (never from the request
-- body). See backend/audit-scoping.js, which fails the build if any
-- query against a company-owned table is missing that filter.
-- ------------------------------------------------------------
create table if not exists l_companies (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,               -- public showcase URL: /showcase/<slug>
    logo_url text,
    email text,
    phone text,
    address text,
    city text,
    country text,
    website text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ENUM TYPES (l_ prefixed)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'l_tenant_tier') then
    create type l_tenant_tier as enum ('guest', 'returning', 'resident', 'exclusive');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_stay_type') then
    create type l_stay_type as enum ('short_stay', 'long_stay');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_unit_status') then
    create type l_unit_status as enum ('vacant', 'occupied', 'maintenance', 'off_market');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_unit_class') then
    create type l_unit_class as enum ('standard', 'premium', 'luxury');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_lease_status') then
    create type l_lease_status as enum ('active', 'completed', 'cancelled', 'pending');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_rate_period') then
    create type l_rate_period as enum ('nightly', 'weekly', 'monthly', 'yearly');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_payment_status') then
    create type l_payment_status as enum ('paid', 'partial', 'late', 'pending', 'refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_expense_category') then
    create type l_expense_category as enum ('utilities', 'maintenance', 'management_fee', 'insurance', 'tax', 'cleaning', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_fault_severity') then
    create type l_fault_severity as enum ('low', 'medium', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_fault_caused_by') then
    create type l_fault_caused_by as enum ('tenant', 'wear_and_tear', 'external', 'unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_fault_status') then
    create type l_fault_status as enum ('open', 'in_progress', 'resolved');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_user_role') then
    create type l_user_role as enum ('manager', 'finance', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_inquiry_status') then
    create type l_inquiry_status as enum ('pending', 'approved', 'declined');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_payout_method') then
    create type l_payout_method as enum ('bank', 'mobile_money');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_subscription_status') then
    create type l_subscription_status as enum ('trial', 'active', 'past_due', 'cancelled');
  end if;
end
$$;

-- ------------------------------------------------------------
-- L_USERS
-- Staff accounts. First account created (via the bootstrap
-- endpoint, only usable while this table is empty) is always
-- a manager. Manager and finance can create/edit/delete records;
-- viewer is read-only across the app.
-- ------------------------------------------------------------
create table if not exists l_users (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    password_hash text not null,
    name text not null,
    role l_user_role not null default 'viewer',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_l_users_email on l_users(email);

-- ------------------------------------------------------------
-- L_TENANTS
-- The spine of everything. Every person gets one permanent
-- record and Lintel ID, regardless of how many stays they have.
-- ------------------------------------------------------------
create table if not exists l_tenants (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    lintel_id text not null,                   -- e.g. LNT-2026-0001; unique per company (index below)
    first_name text not null,
    last_name text not null,
    email text,
    phone text,
    id_document_type text,                    -- passport, national ID, etc.
    id_document_number text,
    nationality text,
    tier l_tenant_tier not null default 'guest',
    score numeric(5,2) not null default 0,     -- 0-100 computed tenant score
    total_stays integer not null default 0,
    total_paid numeric(14,2) not null default 0,
    on_time_payment_rate numeric(5,2) not null default 100,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_l_tenants_lintel_id on l_tenants(lintel_id);
create index if not exists idx_l_tenants_tier on l_tenants(tier);
create index if not exists idx_l_tenants_company on l_tenants(company_id);
-- Lintel IDs restart per company, so uniqueness is per company too.
create unique index if not exists idx_l_tenants_company_lintel on l_tenants(company_id, lintel_id);

-- Counter per (company, year) for LNT-YYYY-#### generation — each
-- company's IDs run 0001, 0002, ... independently.
create table if not exists l_tenant_id_counters (
    company_id uuid not null references l_companies(id) on delete cascade,
    year integer not null,
    last_seq integer not null default 0,
    primary key (company_id, year)
);

-- Log of tier changes and incentives offered/accepted — the audit
-- trail behind every "why is this tenant Exclusive" question.
create table if not exists l_tenant_tier_events (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references l_tenants(id) on delete cascade,
    event_type text not null,                  -- tier_upgrade, incentive_offered, incentive_accepted, incentive_declined
    detail text,
    created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- L_UNITS
-- Every apartment/house is its own mini P&L.
-- ------------------------------------------------------------
create table if not exists l_units (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    unit_code text not null,                   -- e.g. "Airport Res - 4B"; unique per company (index below)
    property_name text not null,
    unit_type text not null,                   -- apartment, house, townhouse, studio
    class l_unit_class not null default 'standard',
    bedrooms integer,
    bathrooms integer,
    address text,
    city text,
    base_rate_short numeric(12,2),             -- nightly rate for short-stay
    base_rate_long numeric(12,2),               -- monthly rate for long-stay
    photo_url text,                             -- optional hero image for the dashboard
    photo_urls text[] not null default '{}',    -- gallery for the public showcase slideshow
    status l_unit_status not null default 'vacant',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_l_units_status on l_units(status);
create index if not exists idx_l_units_class on l_units(class);
create index if not exists idx_l_units_company on l_units(company_id);
-- Two different companies may each have a unit called "Block A - 1".
create unique index if not exists idx_l_units_company_code on l_units(company_id, unit_code);

-- ------------------------------------------------------------
-- L_BOOKING_INQUIRIES
-- Submitted from the public showcase pages (/showcase, /showcase/:id) —
-- no login required to create one. Staff review and approve/decline from
-- the authenticated Booking Requests page; nothing here touches leases
-- automatically, a manager creates the real lease once they've confirmed
-- the booking off-platform.
-- ------------------------------------------------------------
create table if not exists l_booking_inquiries (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    unit_id uuid not null references l_units(id) on delete cascade,
    name text not null,
    email text,
    phone text,
    start_date date,
    end_date date,
    message text,
    status l_inquiry_status not null default 'pending',
    created_at timestamptz not null default now()
);

create index if not exists idx_l_booking_inquiries_unit on l_booking_inquiries(unit_id);
create index if not exists idx_l_booking_inquiries_status on l_booking_inquiries(status);

-- ------------------------------------------------------------
-- L_SETTINGS
-- Account-wide configuration: display currency, where rent payouts
-- should be sent, and this account's Lintel subscription.
--
-- Exactly one row per company, enforced by the unique index below. A
-- company's row is created at signup alongside the company itself.
-- ------------------------------------------------------------
create table if not exists l_settings (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),

    -- Default currency for NEW payments. Each payment stores its own
    -- currency (l_payments.currency), so historical amounts are never
    -- retroactively relabelled when this changes.
    default_currency text not null default 'GHS',

    payout_method l_payout_method,
    payout_bank_name text,
    payout_account_name text,
    payout_account_number text,
    payout_branch text,
    payout_mobile_provider text,
    payout_mobile_number text,

    subscription_plan text not null default 'trial',
    subscription_status l_subscription_status not null default 'trial',
    subscription_started_on date,
    subscription_renews_on date,
    subscription_amount numeric(12,2),
    subscription_currency text not null default 'GHS',

    updated_at timestamptz not null default now()
);

create unique index if not exists idx_l_settings_company_unique on l_settings(company_id);

-- ------------------------------------------------------------
-- L_LEASES
-- Covers everything from a 2-night Airbnb-style stay to a
-- multi-year residential lease.
-- ------------------------------------------------------------
create table if not exists l_leases (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references l_tenants(id) on delete restrict,
    unit_id uuid not null references l_units(id) on delete restrict,
    stay_type l_stay_type not null,
    start_date date not null,
    end_date date,                              -- null for open-ended long stays
    agreed_rate numeric(12,2) not null,
    rate_period l_rate_period not null,
    status l_lease_status not null default 'active',
    source text,                                -- direct, airbnb, booking.com, referral
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_l_leases_tenant on l_leases(tenant_id);
create index if not exists idx_l_leases_unit on l_leases(unit_id);
create index if not exists idx_l_leases_status on l_leases(status);

-- ------------------------------------------------------------
-- L_PAYMENTS
-- Every dollar/cedi collected, tied to lease + tenant + unit.
-- ------------------------------------------------------------
create table if not exists l_payments (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    lease_id uuid not null references l_leases(id) on delete cascade,
    tenant_id uuid not null references l_tenants(id) on delete restrict,
    unit_id uuid not null references l_units(id) on delete restrict,
    amount numeric(12,2) not null,
    currency text not null default 'GHS',
    due_date date,
    payment_date date,
    status l_payment_status not null default 'pending',
    method text,                                -- cash, mobile_money, card, bank_transfer
    reference text,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists idx_l_payments_tenant on l_payments(tenant_id);
create index if not exists idx_l_payments_unit on l_payments(unit_id);
create index if not exists idx_l_payments_lease on l_payments(lease_id);
create index if not exists idx_l_payments_status on l_payments(status);

-- ------------------------------------------------------------
-- L_EXPENSES
-- Recurring / operational costs per unit (not capitalized).
-- ------------------------------------------------------------
create table if not exists l_expenses (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    unit_id uuid not null references l_units(id) on delete cascade,
    category l_expense_category not null,
    amount numeric(12,2) not null,
    expense_date date not null,
    description text,
    created_at timestamptz not null default now()
);

create index if not exists idx_l_expenses_unit on l_expenses(unit_id);
create index if not exists idx_l_expenses_date on l_expenses(expense_date);

-- ------------------------------------------------------------
-- L_RENOVATIONS
-- Capitalized improvements, tracked separately from expenses so
-- they don't distort monthly operating figures. before/after
-- rate lets us prove renovation ROI.
-- ------------------------------------------------------------
create table if not exists l_renovations (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    unit_id uuid not null references l_units(id) on delete cascade,
    description text not null,
    cost numeric(12,2) not null,
    start_date date,
    end_date date,
    rate_before numeric(12,2),
    rate_after numeric(12,2),
    created_at timestamptz not null default now()
);

create index if not exists idx_l_renovations_unit on l_renovations(unit_id);

-- ------------------------------------------------------------
-- L_FAULTS
-- Logged against the unit always, and optionally against the
-- tenant if they caused it (feeds into tenant score).
-- ------------------------------------------------------------
create table if not exists l_faults (
    company_id uuid not null references l_companies(id) on delete cascade,
    id uuid primary key default gen_random_uuid(),
    unit_id uuid not null references l_units(id) on delete cascade,
    tenant_id uuid references l_tenants(id) on delete set null,
    description text not null,
    severity l_fault_severity not null default 'low',
    caused_by l_fault_caused_by not null default 'unknown',
    status l_fault_status not null default 'open',
    reported_date date not null default current_date,
    resolved_date date,
    cost numeric(12,2),
    created_at timestamptz not null default now()
);

create index if not exists idx_l_faults_unit on l_faults(unit_id);
create index if not exists idx_l_faults_tenant on l_faults(tenant_id);
create index if not exists idx_l_faults_status on l_faults(status);

create index if not exists idx_l_tenant_tier_events_tenant on l_tenant_tier_events(tenant_id);

-- ------------------------------------------------------------
-- updated_at trigger (Lintel-specific function name, so it can
-- never clash with another product's own updated_at trigger fn)
-- ------------------------------------------------------------
create or replace function l_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = '';

drop trigger if exists trg_l_tenants_updated_at on l_tenants;
create trigger trg_l_tenants_updated_at before update on l_tenants
  for each row execute function l_set_updated_at();

drop trigger if exists trg_l_units_updated_at on l_units;
create trigger trg_l_units_updated_at before update on l_units
  for each row execute function l_set_updated_at();

drop trigger if exists trg_l_leases_updated_at on l_leases;
create trigger trg_l_leases_updated_at before update on l_leases
  for each row execute function l_set_updated_at();

drop trigger if exists trg_l_users_updated_at on l_users;
create trigger trg_l_users_updated_at before update on l_users
  for each row execute function l_set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security — enabled on every Lintel table with no
-- policies defined. Safe because the backend only ever talks to
-- Postgres using the Supabase service_role key, which bypasses
-- RLS entirely; access control is enforced in the API layer
-- (see backend/src/middleware/auth.js) instead.
-- ------------------------------------------------------------
alter table l_tenants enable row level security;
alter table l_tenant_id_counters enable row level security;
alter table l_tenant_tier_events enable row level security;
alter table l_units enable row level security;
alter table l_leases enable row level security;
alter table l_payments enable row level security;
alter table l_expenses enable row level security;
alter table l_renovations enable row level security;
alter table l_faults enable row level security;
alter table l_users enable row level security;
alter table l_booking_inquiries enable row level security;
alter table l_settings enable row level security;

-- ------------------------------------------------------------
-- Table-level grants for service_role. RLS bypass (service_role
-- has BYPASSRLS) only skips row-level policies — it does NOT imply
-- the base table GRANTs PostgREST checks first. Without these,
-- every request from the backend fails with
-- "permission denied for table ..." (Postgres error 42501), even
-- though the key and RLS setup are both correct.
-- ------------------------------------------------------------
grant usage on schema public to service_role;

grant select, insert, update, delete on
  l_tenants,
  l_tenant_id_counters,
  l_tenant_tier_events,
  l_units,
  l_leases,
  l_payments,
  l_expenses,
  l_renovations,
  l_faults,
  l_users,
  l_booking_inquiries,
  l_settings
to service_role;

drop trigger if exists trg_l_settings_updated_at on l_settings;
create trigger trg_l_settings_updated_at before update on l_settings
  for each row execute function l_set_updated_at();

-- ------------------------------------------------------------
-- Storage bucket for photos uploaded from a device (see
-- backend/src/routes/uploads.js). Public-read so the showcase pages can
-- display them without signed URLs; writes only ever happen server-side
-- with the service_role key.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lintel-photos', 'lintel-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ------------------------------------------------------------
-- PROPERTIES, TENANT ONBOARDING CAPTURE, ACCESS CREDENTIALS
-- Mirrors migrations: add_properties_entity,
-- add_tenant_onboarding_capture, add_access_credentials_and_events.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'l_property_type') then
    create type l_property_type as enum ('apartment_block','estate','standalone_house','townhouse_complex','commercial','mixed_use');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_onboarding_status') then
    create type l_onboarding_status as enum ('in_progress','complete');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_credential_type') then
    create type l_credential_type as enum ('keycard','fob','pin','mobile_key','biometric');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_credential_status') then
    create type l_credential_status as enum ('active','lost','revoked','expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_access_event_type') then
    create type l_access_event_type as enum ('unlock','denied','lock','tamper');
  end if;
end $$;

-- A building or estate. Units live inside a property.
create table if not exists l_properties (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    name text not null,
    property_type l_property_type not null default 'apartment_block',
    address text, city text, region text, country text,
    digital_address text,                       -- Ghana Post GPS etc.
    year_built integer, floors integer,
    description text,
    photo_url text,
    photo_urls text[] not null default '{}',
    amenities text[] not null default '{}',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_l_properties_company on l_properties(company_id);
create unique index if not exists idx_l_properties_company_name on l_properties(company_id, name);

alter table l_units add column if not exists property_id uuid references l_properties(id) on delete set null;
create index if not exists idx_l_units_property on l_units(property_id);

-- Identity / KYC captured during onboarding.
alter table l_tenants add column if not exists date_of_birth date;
alter table l_tenants add column if not exists photo_url text;
alter table l_tenants add column if not exists id_document_expiry date;
alter table l_tenants add column if not exists id_document_front_url text;
alter table l_tenants add column if not exists id_document_back_url text;
alter table l_tenants add column if not exists onboarding_status l_onboarding_status not null default 'in_progress';
alter table l_tenants add column if not exists onboarded_at timestamptz;

create table if not exists l_tenant_contacts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    tenant_id uuid not null references l_tenants(id) on delete cascade,
    name text not null, relationship text, phone text, email text, address text,
    is_next_of_kin boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists l_tenant_occupants (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    tenant_id uuid not null references l_tenants(id) on delete cascade,
    full_name text not null, relationship text, date_of_birth date, notes text,
    created_at timestamptz not null default now()
);

create table if not exists l_tenant_vehicles (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    tenant_id uuid not null references l_tenants(id) on delete cascade,
    plate_number text not null, make text, model text, colour text,
    parking_slot text, notes text,
    created_at timestamptz not null default now()
);

-- Keycards/fobs/PINs. RECORD-KEEPING ONLY — Lintel does not talk to lock
-- hardware. Shape is reader-agnostic so a controller can be connected
-- later without remodelling.
create table if not exists l_access_credentials (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    credential_type l_credential_type not null default 'keycard',
    card_number text not null,
    label text,
    tenant_id uuid references l_tenants(id) on delete set null,
    holder_name text,                           -- staff/contractors with no tenant record
    property_id uuid references l_properties(id) on delete cascade,
    unit_id uuid references l_units(id) on delete set null,
    status l_credential_status not null default 'active',
    valid_from date, valid_until date,
    issued_at timestamptz not null default now(),
    issued_by uuid references l_users(id) on delete set null,
    revoked_at timestamptz, revoked_reason text,
    replaces_id uuid references l_access_credentials(id) on delete set null,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists idx_l_access_credentials_company_card on l_access_credentials(company_id, card_number);

-- Append-only door activity. Empty until real reader hardware posts here.
create table if not exists l_access_events (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    credential_id uuid references l_access_credentials(id) on delete set null,
    property_id uuid references l_properties(id) on delete cascade,
    unit_id uuid references l_units(id) on delete set null,
    event_type l_access_event_type not null,
    occurred_at timestamptz not null default now(),
    device_id text, direction text, raw jsonb,
    created_at timestamptz not null default now()
);

alter table l_properties         enable row level security;
alter table l_tenant_contacts    enable row level security;
alter table l_tenant_occupants   enable row level security;
alter table l_tenant_vehicles    enable row level security;
alter table l_access_credentials enable row level security;
alter table l_access_events      enable row level security;

grant select, insert, update, delete on
  l_properties, l_tenant_contacts, l_tenant_occupants, l_tenant_vehicles,
  l_access_credentials, l_access_events
to service_role;

-- ------------------------------------------------------------
-- DETAILED SPECIFICATIONS
-- Mirrors migration add_property_and_unit_specifications.
-- Split: whole-building facts on the property, per-apartment facts on
-- the unit. Storeys/staircases appear on both because a duplex inside a
-- 6-storey block legitimately has its own.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'l_furnishing') then
    create type l_furnishing as enum ('unfurnished','semi_furnished','fully_furnished');
  end if;
end $$;

-- Building-level
alter table l_properties add column if not exists storeys integer;
alter table l_properties add column if not exists staircases integer;
alter table l_properties add column if not exists staircase_type text;
alter table l_properties add column if not exists plot_size numeric(12,2);
alter table l_properties add column if not exists plot_size_unit text default 'sqm';
alter table l_properties add column if not exists total_units integer;
alter table l_properties add column if not exists parking_spaces integer;
alter table l_properties add column if not exists glass_panel_type text;
alter table l_properties add column if not exists exterior_finish text;
alter table l_properties add column if not exists roofing_type text;
alter table l_properties add column if not exists wall_material text;
alter table l_properties add column if not exists water_source text;
alter table l_properties add column if not exists power_backup text;

-- Apartment-level
alter table l_units add column if not exists floor_area numeric(12,2);
alter table l_units add column if not exists floor_area_unit text default 'sqm';
alter table l_units add column if not exists floor_number integer;
alter table l_units add column if not exists storeys integer;              -- 1 = flat, 2 = duplex
alter table l_units add column if not exists staircases integer;
alter table l_units add column if not exists rooms integer;
alter table l_units add column if not exists kitchens integer;
alter table l_units add column if not exists halls integer;
alter table l_units add column if not exists balconies integer;
alter table l_units add column if not exists ensuite_bathrooms integer;
alter table l_units add column if not exists store_rooms integer;
alter table l_units add column if not exists glass_panel_type text;
alter table l_units add column if not exists wood_colour text;
alter table l_units add column if not exists joinery_material text;
alter table l_units add column if not exists flooring_type text;
alter table l_units add column if not exists ceiling_type text;
alter table l_units add column if not exists wall_colour text;
alter table l_units add column if not exists furnishing l_furnishing;
alter table l_units add column if not exists has_air_conditioning boolean;
alter table l_units add column if not exists view_orientation text;
alter table l_units add column if not exists features text[] not null default '{}';
-- Public-facing blurb. `notes` stays internal and is never shown publicly.
alter table l_units add column if not exists description text;

-- ============================================================
-- DATABASE-LEVEL TENANT ISOLATION
-- Mirrors migration enforce_tenant_isolation_composite_fks.
--
-- Isolation has two independent layers:
--
--  1. API layer — every query filters on the company_id carried in the
--     caller's signed JWT (never from the request body). Verified by
--     backend/audit-scoping.js.
--
--  2. THIS layer — every cross-table foreign key includes company_id, so
--     Postgres itself refuses to let one company's row reference
--     another's. A lease can only point at a unit in the same company, a
--     payment only at a lease in the same company, and so on.
--
-- Why foreign keys rather than RLS: the backend connects as service_role,
-- which has BYPASSRLS, so row-level policies would never be evaluated and
-- would give false confidence. Foreign keys are enforced for every role
-- including service_role, so this holds even against a buggy query or a
-- mistake made directly in SQL.
--
-- Delete behaviour is unchanged; SET NULL uses the PG15+ column-specific
-- form so company_id (NOT NULL) is never nulled.
-- ============================================================

-- Parents need a unique key on (id, company_id) to be referenced that way.
-- id is already the primary key, so this adds no new restriction.
alter table l_properties         add constraint l_properties_id_company_key         unique (id, company_id);
alter table l_units              add constraint l_units_id_company_key              unique (id, company_id);
alter table l_tenants            add constraint l_tenants_id_company_key            unique (id, company_id);
alter table l_leases             add constraint l_leases_id_company_key             unique (id, company_id);
alter table l_users              add constraint l_users_id_company_key              unique (id, company_id);
alter table l_access_credentials add constraint l_access_credentials_id_company_key unique (id, company_id);

-- Every cross-table reference below carries company_id. On a fresh
-- install these replace the single-column versions declared earlier.
alter table l_units               drop constraint if exists l_units_property_id_fkey;
alter table l_units               add  constraint l_units_property_id_fkey
  foreign key (property_id, company_id) references l_properties(id, company_id) on delete set null (property_id);

alter table l_leases              drop constraint if exists l_leases_tenant_id_fkey;
alter table l_leases              add  constraint l_leases_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete restrict;
alter table l_leases              drop constraint if exists l_leases_unit_id_fkey;
alter table l_leases              add  constraint l_leases_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete restrict;

alter table l_payments            drop constraint if exists l_payments_lease_id_fkey;
alter table l_payments            add  constraint l_payments_lease_id_fkey
  foreign key (lease_id, company_id) references l_leases(id, company_id) on delete cascade;
alter table l_payments            drop constraint if exists l_payments_tenant_id_fkey;
alter table l_payments            add  constraint l_payments_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete restrict;
alter table l_payments            drop constraint if exists l_payments_unit_id_fkey;
alter table l_payments            add  constraint l_payments_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete restrict;

alter table l_expenses            drop constraint if exists l_expenses_unit_id_fkey;
alter table l_expenses            add  constraint l_expenses_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete cascade;

alter table l_renovations         drop constraint if exists l_renovations_unit_id_fkey;
alter table l_renovations         add  constraint l_renovations_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete cascade;

alter table l_faults              drop constraint if exists l_faults_unit_id_fkey;
alter table l_faults              add  constraint l_faults_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete cascade;
alter table l_faults              drop constraint if exists l_faults_tenant_id_fkey;
alter table l_faults              add  constraint l_faults_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete set null (tenant_id);

alter table l_booking_inquiries   drop constraint if exists l_booking_inquiries_unit_id_fkey;
alter table l_booking_inquiries   add  constraint l_booking_inquiries_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete cascade;

alter table l_tenant_tier_events  drop constraint if exists l_tenant_tier_events_tenant_id_fkey;
alter table l_tenant_tier_events  add  constraint l_tenant_tier_events_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;

alter table l_tenant_contacts     drop constraint if exists l_tenant_contacts_tenant_id_fkey;
alter table l_tenant_contacts     add  constraint l_tenant_contacts_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;

alter table l_tenant_occupants    drop constraint if exists l_tenant_occupants_tenant_id_fkey;
alter table l_tenant_occupants    add  constraint l_tenant_occupants_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;

alter table l_tenant_vehicles     drop constraint if exists l_tenant_vehicles_tenant_id_fkey;
alter table l_tenant_vehicles     add  constraint l_tenant_vehicles_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;

alter table l_access_credentials  drop constraint if exists l_access_credentials_property_id_fkey;
alter table l_access_credentials  add  constraint l_access_credentials_property_id_fkey
  foreign key (property_id, company_id) references l_properties(id, company_id) on delete cascade;
alter table l_access_credentials  drop constraint if exists l_access_credentials_tenant_id_fkey;
alter table l_access_credentials  add  constraint l_access_credentials_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete set null (tenant_id);
alter table l_access_credentials  drop constraint if exists l_access_credentials_unit_id_fkey;
alter table l_access_credentials  add  constraint l_access_credentials_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete set null (unit_id);
alter table l_access_credentials  drop constraint if exists l_access_credentials_issued_by_fkey;
alter table l_access_credentials  add  constraint l_access_credentials_issued_by_fkey
  foreign key (issued_by, company_id) references l_users(id, company_id) on delete set null (issued_by);
alter table l_access_credentials  drop constraint if exists l_access_credentials_replaces_id_fkey;
alter table l_access_credentials  add  constraint l_access_credentials_replaces_id_fkey
  foreign key (replaces_id, company_id) references l_access_credentials(id, company_id) on delete set null (replaces_id);

alter table l_access_events       drop constraint if exists l_access_events_credential_id_fkey;
alter table l_access_events       add  constraint l_access_events_credential_id_fkey
  foreign key (credential_id, company_id) references l_access_credentials(id, company_id) on delete set null (credential_id);
alter table l_access_events       drop constraint if exists l_access_events_property_id_fkey;
alter table l_access_events       add  constraint l_access_events_property_id_fkey
  foreign key (property_id, company_id) references l_properties(id, company_id) on delete cascade;
alter table l_access_events       drop constraint if exists l_access_events_unit_id_fkey;
alter table l_access_events       add  constraint l_access_events_unit_id_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete set null (unit_id);

-- ============================================================
-- SUBSCRIPTION OWNERSHIP
-- Mirrors migration owner_controlled_subscriptions.
--
-- Subscription state used to live on l_settings, which each subscriber's
-- own manager can edit — so a customer could mark themselves "active"
-- and renewing in 2030. It now lives in l_subscriptions, writable only
-- through /api/admin by a platform admin, and readable by the subscriber.
-- ============================================================

-- Operator of Lintel itself. Deliberately separate from l_user_role,
-- which only ever describes authority INSIDE one's own company.
alter table l_users add column if not exists is_platform_admin boolean not null default false;

-- Global plan catalogue (not per-company).
create table if not exists l_plans (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text,
    price numeric(12,2) not null default 0,
    currency text not null default 'GHS',
    billing_interval text not null default 'monthly',
    max_properties integer,                     -- null = unlimited
    max_units integer,
    max_staff integer,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into l_plans (code, name, description, price, currency, billing_interval, max_properties, max_units, max_staff, sort_order)
values
  ('trial',      'Free trial', '14-day trial with full access',            0,    'GHS', 'monthly', 2,    10,   3,    0),
  ('starter',    'Starter',    'For a single building or small portfolio', 250,  'GHS', 'monthly', 3,    25,   5,    1),
  ('growth',     'Growth',     'For a growing agency',                     600,  'GHS', 'monthly', 10,   150,  15,   2),
  ('enterprise', 'Enterprise', 'Unlimited portfolio and staff',            1500, 'GHS', 'monthly', null, null, null, 3)
on conflict (code) do nothing;

-- One per company, controlled by the platform admin.
create table if not exists l_subscriptions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null unique references l_companies(id) on delete cascade,
    plan_id uuid references l_plans(id) on delete set null,
    status l_subscription_status not null default 'trial',
    started_on date,
    trial_ends_on date,
    renews_on date,
    -- Snapshot of the agreed price, so editing the catalogue never
    -- silently rewrites what an existing subscriber is charged.
    amount numeric(12,2),
    currency text not null default 'GHS',
    notes text,                                 -- internal, operator-only
    updated_by uuid references l_users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_l_subscriptions_status on l_subscriptions(status);

alter table l_plans         enable row level security;
alter table l_subscriptions enable row level security;
grant select, insert, update, delete on l_plans, l_subscriptions to service_role;

-- Superseded by l_subscriptions; dropped so there is one source of truth.
alter table l_settings drop column if exists subscription_plan;
alter table l_settings drop column if exists subscription_status;
alter table l_settings drop column if exists subscription_started_on;
alter table l_settings drop column if exists subscription_renews_on;
alter table l_settings drop column if exists subscription_amount;
alter table l_settings drop column if exists subscription_currency;

-- ------------------------------------------------------------
-- PLAN TIERS (mirrors migration restructure_plan_tiers)
-- trial 30 days / starter / classic / premium.
-- null limit = unlimited.
-- ------------------------------------------------------------
alter table l_plans add column if not exists max_tenants integer;
alter table l_plans add column if not exists trial_days integer;

insert into l_plans (code, name, description, price, currency, billing_interval,
                     trial_days, max_properties, max_units, max_tenants, max_staff, sort_order)
values
  ('trial',   'Free trial', '30-day trial',              0,    'GHS', 'monthly', 30, 2,    10,   5,    2,    0),
  ('starter', 'Starter',    'For a small portfolio',     250,  'GHS', 'monthly', null, 10,  50,   10,   5,    1),
  ('classic', 'Classic',    'For an established agency', 600,  'GHS', 'monthly', null, 50,  50,   50,   50,   2),
  ('premium', 'Premium',    'Unlimited portfolio, tenants and staff',
                                                          1500, 'GHS', 'monthly', null, null, null, null, null, 3)
on conflict (code) do update set
  name            = excluded.name,
  description     = excluded.description,
  price           = excluded.price,
  trial_days      = excluded.trial_days,
  max_properties  = excluded.max_properties,
  max_units       = excluded.max_units,
  max_tenants     = excluded.max_tenants,
  max_staff       = excluded.max_staff,
  sort_order      = excluded.sort_order;

-- ------------------------------------------------------------
-- L_PASSWORD_RESETS (mirrors migration add_password_reset_tokens)
-- Only a SHA-256 hash of the token is stored, never the token itself, so
-- a leaked database dump can't be used to reset anyone's password. The
-- raw token exists solely in the emailed link. Single use + expiry.
-- ------------------------------------------------------------
create table if not exists l_password_resets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references l_users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    used_at timestamptz,
    requested_ip text,
    created_at timestamptz not null default now()
);

create index if not exists idx_l_password_resets_user on l_password_resets(user_id);
create index if not exists idx_l_password_resets_expires on l_password_resets(expires_at);

alter table l_password_resets enable row level security;
grant select, insert, update, delete on l_password_resets to service_role;

-- ------------------------------------------------------------
-- SALE LISTINGS (mirrors migration add_sale_listings)
-- Each unit is offered for rent, sale, or both. Existing units default
-- to 'rent' so nothing already listed changes behaviour.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'l_listing_type') then
    create type l_listing_type as enum ('rent', 'sale', 'both');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_sale_status') then
    create type l_sale_status as enum ('available', 'under_offer', 'sold');
  end if;
  if not exists (select 1 from pg_type where typname = 'l_inquiry_type') then
    create type l_inquiry_type as enum ('booking', 'purchase');
  end if;
end $$;

alter table l_units add column if not exists listing_type l_listing_type not null default 'rent';
alter table l_units add column if not exists sale_price numeric(14,2);
alter table l_units add column if not exists sale_status l_sale_status;
alter table l_units add column if not exists sale_currency text;
create index if not exists idx_l_units_listing_type on l_units(listing_type);

alter table l_booking_inquiries add column if not exists inquiry_type l_inquiry_type not null default 'booking';
alter table l_booking_inquiries add column if not exists offer_amount numeric(14,2);

-- ------------------------------------------------------------
-- L_TENANT_PORTAL_TOKENS (mirrors add_tenant_portal_tokens)
-- Tenants view their own statement via a time-limited emailed link
-- rather than an account with a password — see
-- backend/src/routes/tenantPortal.js for the reasoning. Only a hash of
-- the token is stored. Viewing does not burn the link; last_used_at
-- records activity instead.
-- ------------------------------------------------------------
create table if not exists l_tenant_portal_tokens (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    tenant_id uuid not null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    last_used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_l_tenant_portal_tokens_tenant on l_tenant_portal_tokens(tenant_id);
create index if not exists idx_l_tenant_portal_tokens_expires on l_tenant_portal_tokens(expires_at);

-- Composite, so a token can never point at a tenant in another company.
alter table l_tenant_portal_tokens drop constraint if exists l_tenant_portal_tokens_tenant_id_fkey;
alter table l_tenant_portal_tokens add constraint l_tenant_portal_tokens_tenant_id_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;

alter table l_tenant_portal_tokens enable row level security;
grant select, insert, update, delete on l_tenant_portal_tokens to service_role;

-- ------------------------------------------------------------
-- DOCUMENTS, TENANT PORTAL, RENT ESCALATION
-- Mirrors add_document_storage and add_rent_escalation.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'l_document_kind') then
    create type l_document_kind as enum ('lease_agreement','id_document','receipt','inspection','invoice','other');
  end if;
end $$;

-- Signed agreements and files. PRIVATE bucket — a tenancy agreement must
-- not be readable by URL, so the API serves short-lived signed links.
create table if not exists l_documents (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    lease_id uuid, tenant_id uuid, unit_id uuid, property_id uuid,
    kind l_document_kind not null default 'other',
    title text not null,
    file_url text not null,                     -- storage path, never returned to clients
    mime_type text,
    size_bytes bigint,
    notes text,
    uploaded_by uuid references l_users(id) on delete set null,
    created_at timestamptz not null default now(),
    -- A document attached to nothing would be unfindable.
    constraint l_documents_has_owner check (
      lease_id is not null or tenant_id is not null
      or unit_id is not null or property_id is not null)
);

alter table l_documents add constraint l_documents_lease_fkey
  foreign key (lease_id, company_id) references l_leases(id, company_id) on delete cascade;
alter table l_documents add constraint l_documents_tenant_fkey
  foreign key (tenant_id, company_id) references l_tenants(id, company_id) on delete cascade;
alter table l_documents add constraint l_documents_unit_fkey
  foreign key (unit_id, company_id) references l_units(id, company_id) on delete cascade;
alter table l_documents add constraint l_documents_property_fkey
  foreign key (property_id, company_id) references l_properties(id, company_id) on delete cascade;

insert into storage.buckets (id, name, public, file_size_limit)
values ('lintel-documents', 'lintel-documents', false, 15728640)
on conflict (id) do update set public = false;

-- Rent escalation. Increases are NEVER applied automatically — the
-- nightly job only surfaces reviews that are due; a person applies them,
-- and every change is recorded in l_rent_reviews.
alter table l_leases add column if not exists escalation_percent numeric(5,2);
alter table l_leases add column if not exists next_review_on date;
alter table l_leases add column if not exists last_escalated_on date;

create table if not exists l_rent_reviews (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references l_companies(id) on delete cascade,
    lease_id uuid not null,
    previous_rate numeric(12,2) not null,
    new_rate numeric(12,2) not null,
    percent_applied numeric(5,2),
    effective_on date not null,
    note text,
    applied_by uuid references l_users(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table l_rent_reviews add constraint l_rent_reviews_lease_fkey
  foreign key (lease_id, company_id) references l_leases(id, company_id) on delete cascade;

alter table l_documents    enable row level security;
alter table l_rent_reviews enable row level security;
grant select, insert, update, delete on l_documents, l_rent_reviews to service_role;


-- ---------------------------------------------------------------------
-- MULTI-CURRENCY
--
-- Currency resolves down a chain, each level falling back to the one
-- above it:
--
--     lease -> unit -> property -> l_settings.default_currency
--
-- Every column below is NULLABLE and NULL means "inherit", not
-- "unknown". If these defaulted to a concrete code instead, changing a
-- property's currency later would silently leave its existing units
-- pinned to the old one — inheritance has to be expressed as absence.
-- ---------------------------------------------------------------------
ALTER TABLE l_properties ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE l_units      ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE l_leases     ADD COLUMN IF NOT EXISTS currency text;

-- Rates back the INDICATIVE converted totals on the dashboard and
-- reports only. A stored amount is never converted: money is kept and
-- shown in the currency it was actually agreed or received in.
-- Shape: {"USD": 15.2} — one USD buys 15.2 of default_currency.
ALTER TABLE l_settings ADD COLUMN IF NOT EXISTS exchange_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

-- A zero or negative rate would produce nonsense totals that still look
-- authoritative, so it is rejected at the database. CHECK constraints
-- cannot contain a subquery, hence the immutable helper.
CREATE OR REPLACE FUNCTION l_exchange_rates_valid(rates jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT rates IS NULL
      OR jsonb_typeof(rates) = 'object'
     AND NOT EXISTS (
           SELECT 1 FROM jsonb_each(rates) AS r(k, v)
            WHERE jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric <= 0
         );
$$;

ALTER TABLE l_settings DROP CONSTRAINT IF EXISTS l_settings_exchange_rates_positive;
ALTER TABLE l_settings ADD CONSTRAINT l_settings_exchange_rates_positive
  CHECK (l_exchange_rates_valid(exchange_rates));
