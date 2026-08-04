# Lintel — Real Estate Management Platform

Tracks tenants, units (apartments and housing, short-stay through multi-year),
leases, payments, expenses, renovations, and faults — with a permanent
Lintel ID per tenant that carries their history and unlocks lifecycle
incentives (Guest → Returning → Resident → Exclusive).

## Structure

- `backend/` — Node/Express API backed by Supabase (Postgres). Runs as a
  normal long-lived server locally (`src/index.js`) and as a Netlify
  Function in production (`src/lambda.js` wraps the exact same Express app
  from `src/app.js` via `serverless-http`) — same route/middleware code
  either way, no duplicated logic.
- `frontend/` — React (Vite) app, luxury-styled dashboard
- `netlify/functions/` — thin entrypoints Netlify actually deploys; the
  real logic lives under `backend/src/` so it's shared with local dev
- `db/schema.sql` — full database schema, run once in your Supabase project

## Deployment model

Everything runs on **GitHub + Supabase + Netlify** — no separate backend
host needed. Supabase is the database. Netlify serves the built frontend
and runs the API as a serverless function (requests to `/api/*` are
redirected to it — see `netlify.toml`). Billing automation
(`generate-charges` / `flag-late-payments`) runs as a Netlify **Scheduled
Function** (`netlify/functions/scheduled-billing.js`, cron declared in
`netlify.toml`) instead of the `node-cron` job used locally.

Trade-off worth knowing: every request cold-starts the whole Express app in
a serverless function, and there's no in-memory state shared between
requests — fine at this app's scale, but worth knowing if traffic grows.

In Netlify's site settings, set these environment variables:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` — same values as
  your local `backend/.env`
- `DEV_MODE=false` — keep the dev-only `/api/auth/dev-login` route disabled
  in production
- `VITE_API_URL=/api` — relative path, since the API now lives on the same
  domain as the frontend (this is **different** from the `http://localhost:4000/api`
  used for local dev — see `frontend/.env.example`)
- `FRONTEND_URL` — your Netlify site's URL (e.g. `https://lintelapp.netlify.app`),
  used to restrict CORS. Defaults already include the current domain, but set
  this explicitly if you deploy to a different one.
- Do **not** set `NODE_ENV=production` as a Netlify site environment
  variable — Netlify already provides `CONTEXT=production` automatically at
  build and function runtime, which the backend checks for the same
  purpose. Setting `NODE_ENV=production` yourself makes `npm install` skip
  `devDependencies` *during the build step too* — which is where `vite`
  lives — causing a silent "vite: not found" build failure. (If you run the
  backend on a non-Netlify host, set `NODE_ENV=production` there instead —
  `CONTEXT` won't exist outside Netlify.)

## Security posture

Built assuming strangers on the internet will hit this deployment (see
"Letting people test it" below), so a few things are hardened beyond the
bare minimum:
- **Rate limiting** on `/api/auth/login`, `/api/auth/signup`, and
  `/api/auth/register` (20 requests / 15 min per IP) to slow down brute-force
  and mass account creation.
- **Helmet** security headers on every response.
- **CORS allowlist** — only origins in `FRONTEND_URL` (plus local dev ports)
  can call the API from a browser.
- **Sanitized error responses** — in production, unexpected server errors
  return a generic message instead of the real exception text; full detail
  still goes to the server logs.
- **Signup can never grant itself a privileged role** — `/api/auth/signup`
  hardcodes `role: 'viewer'` server-side and ignores anything else the
  request sends.

## Letting people test it

Anyone can create their own account from the login screen ("Create a free
trial account") without asking you first. Self-service signups always land
as `viewer` — read-only everywhere, blocked server-side (not just hidden in
the UI) from creating/editing/deleting anything. They see the same shared
demo dataset as everyone else.

This is intentionally simple: one shared dataset, no per-signup data
isolation. Fine for a product demo; not fine once this holds a real client's
actual books. A future multi-tenant redesign (each subscriber gets their own
isolated data, admin-of-their-own-office) is a known next step, not yet
built — see the manager-created-staff flow (`POST /api/auth/register`) for
real business use in the meantime.

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

Set `ENABLE_CRON=true` in `.env` if you want your **local** backend process
to auto-generate charges and flag late payments once a day (00:05) on its
own, in addition to the manual buttons on the Payments page. In production
this same job runs as a Netlify Scheduled Function instead — see
"Deployment model" below.

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
