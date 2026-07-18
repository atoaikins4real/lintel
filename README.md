# Lintel — Real Estate Management Platform

Tracks tenants, units (apartments and housing, short-stay through multi-year),
leases, payments, expenses, renovations, and faults — with a permanent
Lintel ID per tenant that carries their history and unlocks lifecycle
incentives (Guest → Returning → Resident → Exclusive).

## Structure

- `backend/` — Node/Express API backed by Supabase (Postgres)
- `frontend/` — React (Vite) app, luxury-styled dashboard
- `db/schema.sql` — full database schema, run once in your Supabase project

## First-time setup

### 1. Database

1. Create a project at supabase.com (or point at any Postgres 14+ instance).
2. Open the SQL editor and run `db/schema.sql`.
3. Grab your Project URL and `service_role` key from Project Settings > API.

### 2. Backend

```
cd backend
npm install
cp .env.example .env      # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
npm run dev                # http://localhost:4000
```

Generate a `JWT_SECRET` with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `ENABLE_CRON=true` in `.env` if you want the backend process to
auto-generate charges and flag late payments once a day (00:05) on its own,
in addition to the manual buttons on the Payments page.

### 3. Frontend

```
cd frontend
npm install
cp .env.example .env      # defaults to http://localhost:4000/api, adjust if needed
npm run dev                # http://localhost:5173
```

> If you pulled this folder from the build environment, delete any existing
> `node_modules` folder in `frontend/` before running `npm install` for the
> first time on your machine, then install fresh.

### 4. First login

The app is locked behind a sign-in screen. The very first account you create
(at `http://localhost:5173/login`) automatically becomes a **manager** — no
separate seeding step needed. After that, only a manager can create more
staff accounts (`POST /api/auth/register`, or via a future "Staff" admin
screen).

## What's built (MVP)

- **Authentication & roles** — JWT-based login, first-run bootstrap (no
  seed script needed), three roles: `manager` and `finance` can create/edit
  everything, `viewer` is read-only across the whole app. All `/api/*`
  routes require a valid session; mutating routes additionally require
  manager or finance.
- Tenant CRUD with auto-generated Lintel ID (`LNT-2026-0001`), score, and
  lifecycle tier, recomputed from lease/payment/fault history
- "Upgrade eligible" endpoint that flags tenants ready for an Exclusive-tier
  offer
- Unit CRUD (apartment/house, standard/premium/luxury class), with a
  royalty-free photo picker for the dashboard hero image
- Lease CRUD covering both short-stay (nightly) and long-stay (monthly/yearly)
- Payment logging tied to lease, tenant, and unit
- **Billing automation** — "Generate this period's charges" creates a
  pending payment for every active long-stay lease not yet billed this
  month/year; "Flag late payments" marks anything past its due date. Both
  are available as buttons on the Payments page (manager/finance only) and
  optionally as a daily cron job (`ENABLE_CRON=true`).
- Expense, renovation, and fault logging per unit (renovations tracked with
  before/after rate to prove ROI)
- Per-unit performance dashboard: revenue, costs, net yield, occupancy,
  open faults — sorted worst-to-best so problem units surface first
- **Reports page** — monthly revenue vs. costs (chart + table), expense
  breakdown by category, all-time portfolio totals, CSV export

## Not yet built (next phases)

- Fine-grained accounting (VAT, withholding, formal statements/exports
  beyond the current CSV)
- Short-stay OTA sync (Airbnb/Booking.com) and dynamic pricing
- Automated late-payment reminders (email/SMS) — late payments are
  currently flagged, not yet messaged
- Staff management UI (creating/editing accounts is API-only for now —
  `POST /api/auth/register` as a manager)
