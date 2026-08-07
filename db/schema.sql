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
