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

## Multi-tenancy

Lintel is multi-tenant: **a company is one subscriber**, and its units,
tenants, leases, payments, staff and settings are invisible to every other
company.

- Signing up from the public page creates a brand-new company workspace,
  makes the signer its **manager**, and seeds it with sample properties,
  tenants, leases and payments so they land in a working system. Sample
  rows are labelled "Sample data — safe to delete."
- A manager adds colleagues from the **Staff** page; those accounts join
  the manager's company automatically.
Isolation is enforced in **two independent layers**, so a mistake in one
doesn't expose data:

**1. API layer.** Every request filters on the `company_id` carried in the
caller's signed JWT — never from the request body or a URL parameter, so
it can't be spoofed.

**2. Database layer.** All 23 cross-table foreign keys include
`company_id`, so Postgres itself refuses to let one company's row
reference another's. A lease can only point at a unit in the same company,
a payment only at a lease in the same company, and so on. Verified against
the live database: cross-company inserts are rejected with a foreign-key
violation, same-company writes succeed, and even re-pointing a row's
`company_id` to another company is refused while dependents exist.

> **Why foreign keys rather than RLS.** RLS is enabled on every `l_` table
> but has no policies, and the backend connects as `service_role`, which
> has `BYPASSRLS` — so row-level policies would never be evaluated and
> would give false confidence. Foreign keys are enforced for *every* role
> including `service_role`, which is why isolation is expressed that way.
> If the backend is ever moved off `service_role`, adding real RLS
> policies becomes worthwhile as a third layer.
- `npm run audit:scoping` (in `backend/`) walks every Supabase query and
  fails if one touches a company-owned table without a `company_id`
  filter. It's verified against a deliberately-broken control, so a green
  result means something. Run it after touching any route.
- Each company gets its own public showcase at `/showcase/<slug>`, branded
  with its name and logo. The slug is editable in Settings.
- Listings show the full specification captured during onboarding: layout
  counts as a stat grid, floor area, furnishing, features, a finishes
  table, and an "About the building" section pulled from the parent
  property. Internal `notes` and the exact street address are deliberately
  never exposed publicly.

Tokens issued before multi-tenancy carry no `company_id` and are rejected
with a "please sign in again" message rather than being defaulted into
someone's data — so **everyone must log in again after this deploys.**

## Currency

A portfolio can mix currencies. Currency resolves down a chain, each
level falling back to the one above it:

```
lease  ->  unit  ->  property  ->  company default (Settings)
```

Each level stores `NULL` to mean **inherit**, so re-denominating a
property carries its apartments and leases with it. Set the currency when
adding a property; override it on an individual apartment or on a single
lease when one tenant pays in something else.

Two rules hold throughout, and most of `backend/src/utils/currency.js`
exists to enforce them:

1. **An amount is never converted on the way into or out of the
   database.** Rent agreed in USD is stored and displayed as USD for ever.
   A payment inherits the currency of the *lease* it settles, not the
   company default — so changing that default later cannot relabel
   history.
2. **Amounts in different currencies are never added together.** Totals
   are returned per currency (`*_by_currency`). Summing GHS and USD into
   one figure isn't a rounding error, it's a fabricated number.

Reports additionally return an `indicative` roll-up converted to the
company default using the rates in Settings, purely so there's one number
to glance at. It carries `complete: false` and a `missing` list whenever a
rate wasn't configured, and the UI says so rather than quietly
under-reporting. Rates never alter a stored amount, so a wrong rate makes
an estimate misleading but cannot corrupt anything.

Expenses, renovations and fault repair costs have no currency column;
they take their unit's. That's a deliberate trade-off — a cost genuinely
incurred in another currency will be labelled with the building's — and it
buys the guarantee that a property's revenue and costs are always in the
same currency, so its P&L is a valid subtraction.

## Subscription notices

The in-app banner covers trials and paid renewals alike (≤7 days, plus
overdue). By email, the nightly job warns at **7, 3 and 1 days** before a
trial ends or a paid subscription renews, and sends the operator a single
digest of everything in that window.

Set `OPERATOR_EMAIL` to receive the digest. Without it the job falls back
to platform-admin accounts — but those may be usernames rather than
addresses (ours are), in which case there is nobody to email and the job
logs that instead of pretending it sent.

### Running a trial with testers

Send testers to the site and have them use **"Start your free trial"** —
signing up creates them a brand-new company, its own settings row, its own
30-day trial subscription, and its own seeded sample data. They land in a
working system and can see nothing of yours.

Do **not** add a tester from the Staff page: that creates a user *inside
your* company, who can then read your live records. Staff invites are for
a subscriber's own colleagues.

There is deliberately no "log in as another role" shortcut. To see the
finance or viewer experience, sign up a throwaway workspace and add staff
to it — the same path a real customer takes.

## Subscriptions (platform owner)

There are two kinds of authority in Lintel, deliberately kept separate:

- **`role`** (manager / finance / viewer) — authority *inside* one company.
  Even a manager is just a customer.
- **`is_platform_admin`** — the operator of Lintel itself. Set on
  `l_users`, never grantable from inside the app by a subscriber.

Subscription state lives in `l_subscriptions`, **not** on the
subscriber-editable settings row. Previously it sat on `l_settings`, which
meant a customer's own manager could mark themselves "active" and renewing
in 2030. Now:

- Subscribers see their plan, status, dates and limits **read-only** in
  Settings. Any subscription fields they send to `PUT /api/settings` are
  ignored rather than trusted.
- Only a platform admin can change a plan or status, via `/api/admin`.
- `/admin` (the "Subscribers" page) lists every company with its plan,
  status, renewal date, computed overdue flag, and real usage (properties,
  units, staff). It's the only place in Lintel that reads across companies.
- `l_plans` is the catalogue. Each subscription stores its own agreed
  `amount`, so changing catalogue pricing never silently rewrites an
  existing deal.

| Plan | Price/mo | Properties | Units | Tenants | Staff |
|---|---|---|---|---|---|
| Free trial (30 days) | 0 | 2 | 10 | 5 | 2 |
| Starter | 250 | 10 | 50 | 10 | 5 |
| Classic | 600 | 50 | 50 | 50 | 50 |
| Premium | 1500 | ∞ | ∞ | ∞ | ∞ |

Trial length comes from `l_plans.trial_days`, so changing it is a data
change rather than a code change. New signups get `trial_ends_on` set from
it automatically. The demo data seeded into a new workspace (1 property, 3
apartments, 2 tenants) deliberately sits inside the trial allowance with
headroom, so a prospect isn't at a limit on day one.

`requirePlatformAdmin` **re-reads the flag from the database on every
request** rather than trusting the JWT, because tokens live for 7 days and
revoking operator rights needs to take effect immediately. Non-admins get
a 404, not a 403, so the admin area's existence isn't advertised.

### Enforcement

Lapsed subscriptions and plan limits are now enforced, deliberately as a
**degradation rather than a lockout**. The rules, in
`backend/src/middleware/subscription.js` and `planLimits.js`:

1. **Reads are never blocked.** A lapsed subscriber can always see their
   tenants, leases and payments. Withholding someone's own business
   records to extract payment isn't acceptable; going read-only is.
2. **7-day grace period** after the due date, so a payment landing late or
   a mistyped date doesn't immediately break someone's operations.
3. **Missing dates never expire.** No `renews_on` means fine, not overdue
   — absence of data isn't evidence of non-payment.
4. **Platform admins are never restricted**, so the operator can't lock
   themselves out of their own tool.
5. **Failures are open.** If the subscription lookup errors, the request
   proceeds. An outage in this check must not take every customer down.

Plan limits (`max_properties`, `max_units`, `max_staff`) block only
*creating new* records. Nothing existing is deleted, hidden or broken — a
subscriber downgraded below current usage keeps everything and simply
can't add more. Edits and deletes always work so they can still tidy up.

Blocked writes return **402** with a message naming the cause and the way
out. The UI warns beforehand: a banner appears 7 days before renewal,
during grace, and explains the read-only state if it arrives. Settings
shows usage against each limit.

> The operator's own workspace ("My Company") is deliberately on the
> Enterprise plan with unlimited limits and no expiry. It was originally
> left on Free trial with a 2-property limit while already holding 4 —
> harmless only because platform admins are exempt, which is too fragile a
> reason to rely on.

Still not built: no payment provider is connected, so nothing charges
anyone automatically — see "A note on money movement".

## Email

Provider-agnostic — choosing one is a config change, not a code change:

```
MAIL_PROVIDER=resend   MAIL_API_KEY=re_xxx        # recommended — no extra package
MAIL_PROVIDER=smtp     MAIL_SMTP_URL=smtps://…    # any host; needs `npm i nodemailer`
MAIL_PROVIDER unset                               # logs to server output
```

> The SMTP adapter loads its package through a **runtime-computed module
> name**. That looks odd but is deliberate: Netlify's function bundler
> resolves `require()` statically, before any code runs, so naming an
> uninstalled package as a literal fails the entire deploy — even inside a
> try/catch that would never execute. `npm run audit:deps` in `backend/`
> catches that class of mistake before it reaches Netlify.

**With nothing configured the app still works** — messages are printed to
the server log, including password-reset links, so the whole flow is
testable before you sign up to anything. Nothing silently pretends to have
sent mail.

Two rules hold everywhere: sending never throws into the caller, and every
failure is logged. A booking request is saved even if the notification
email fails — losing a customer's enquiry because a mail server was down
would be far worse than a missing email.

What gets sent:

| Trigger | To | Notes |
|---|---|---|
| Forgot password | the user | Single-use link, expires in 60 min |
| Staff account created | the new colleague | Username + temporary password |
| Booking request submitted | managers & finance | Previously landed silently |
| Payment flagged late | managers & finance | From the nightly job |
| Trial ending | company contact, else managers | At 7, 3, 1 and 0 days only |

### Password reset

Replaces the old "ask your manager" dead end. Deliberate choices:

- The response is **identical whether or not the address exists**, so it
  can't be used to discover who has an account.
- Only a **SHA-256 hash of the token** is stored — the raw value exists
  only in the emailed link, so a database leak yields nothing usable.
- Tokens are **single-use and expire**; resetting also burns every other
  outstanding token for that user.
- Rate limited, since it sends mail on demand.
- Accounts created with a username rather than an email address have
  nowhere to send to — they get the same generic reply, and a manager
  still has to help.

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
- **Properties** — buildings and estates are their own records. Every unit
  belongs to one, and a property can't be deleted while it still has units.
  Added via a guided wizard (`/properties/onboard`): basics, location and
  plot size, building structure (storeys, floors, staircases and type,
  parking, year built), materials and finishes (glass panels, exterior
  finish, roofing, walls, water source, power backup), amenities, photos,
  review.
- **Apartments** — added via their own wizard (`/units/onboard`): the
  property they sit in, layout counts (bedrooms, bathrooms, en-suites,
  halls, kitchens, balconies, store rooms, total rooms, storeys for
  duplexes, internal staircases, floor number), floor area in sqm or sqft,
  finishes and fittings (flooring, ceiling, wood colour, joinery, glass
  panels, wall colour, outlook, furnishing, air conditioning), features,
  pricing, photos, review. Finish fields are combo inputs — pick a common
  option or type your own.
- Both wizards save the record on the first step, so a part-finished entry
  is kept and resumable rather than lost. "Quick add" remains for a
  bare-minimum record you flesh out later.
- **Guided tenant onboarding** (`/tenants/onboard`) — a six-step intake:
  identity, ID documents (photo + front/back uploads), emergency contact
  and next of kin, other occupants, vehicles, then a review. The tenant
  record is created at step one so a half-finished intake is resumable,
  and the Tenants list flags anyone still mid-setup.
- **Access cards** — keycards, fobs, PINs, mobile keys and biometrics
  issued to tenants, staff or contractors, scoped to a property and
  optionally a unit, with a validity window and active/lost/revoked
  status. Issuing a replacement automatically retires the card it
  replaces. See the caveat below.
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
- **Reports** — four tabs, each with CSV export:
  - *Overview* — monthly revenue vs costs, expense breakdown by category,
    all-time portfolio totals
  - *Property P&L* — profit and loss per building over any date range:
    revenue, expenses, renovations, fault costs, net and margin. Units not
    yet attached to a property appear as "Unassigned" rather than having
    their figures silently dropped.
  - *Rent roll* — every active lease with its contracted rate, plus
    outstanding and overdue amounts, sorted worst-first
  - *Statements* — a full ledger per tenant with company header, tenancy
    history and totals, laid out to print or save as PDF

  **Revenue counts payments marked `paid` only.** Pending and late amounts
  are owed rather than earned; including them would flatter the figures.
  What's owed appears in the Rent roll instead.
- **Sales as well as rentals** — each apartment is offered for `rent`,
  `sale` or `both`, with an asking price and a sale status (available /
  under offer / sold). The showcase badges and prices accordingly, offers
  a rent/sale filter when there's a mix, and shows an "Enquire about
  buying" action alongside (or instead of) "Book now". Purchase enquiries
  ask for an optional offer rather than stay dates, and arrive tagged as
  such on the Booking Requests page.

  Switching a unit back to rent-only clears its asking price and sale
  status, so a stale price can't resurface on the public listing later.
  Existing units all defaulted to `rent`, so nothing already listed
  changed behaviour.
- **Public showcase & booking requests** — `/showcase` (whole portfolio)
  and `/showcase/:id` (single unit) are public pages, no login required,
  meant to be shared on social media: photo slideshow, vacant/occupied
  badge, and a "Book now" request form. Submissions land as pending
  entries on the authenticated **Booking Requests** page for a
  manager/finance user to approve or decline — approving doesn't
  auto-create a lease, that's still a deliberate manual step. Pick a
  unit's showcase photos from the "Manage showcase gallery" button on its
  detail page (separate from the single dashboard hero photo), and grab
  its share link with "Copy public share link" on the same page, or the
  portfolio-wide link via "View public showcase" on the Units page.

- **Photo uploads from your device** — alongside the royalty-free stock
  library, you can upload your own photos to a unit's showcase gallery.
  Images are resized and compressed in the browser first
  (`frontend/src/utils/image.js`) and stored in the public Supabase
  Storage bucket `lintel-photos`.
- **Staff & access** — managers can create accounts for colleagues and
  change anyone's role between manager / finance / viewer. This is how a
  self-service signup (which always arrives as a read-only viewer) gets
  promoted. A manager can't demote themselves if they're the last one.
- **Settings** — account default currency (GHS, NGN, USD, EUR, GBP, ZAR,
  KES), rent payout destination (bank account or mobile money), and this
  account's Lintel subscription details.

### Currency

Each payment stores its own currency, so changing the account default
never retroactively relabels historical amounts. New payments default to
the account currency and can be overridden per payment on the Payments
form. All display formatting goes through `frontend/src/utils/currency.js`.

### A note on door hardware

The access-card feature is **record-keeping only**. Lintel does not
communicate with any lock, reader or controller, so issuing a card in the
app does not program a physical card or open anything.

What it does do is hold the data in the shape real access systems expect —
a credential identifier, a holder, a scope (property, optionally unit) and
a validity window — plus an empty `l_access_events` table ready to receive
door activity. That means connecting a controller later is an integration
job, not a re-modelling job, and no history is lost in the meantime. The
UI says this plainly so nobody mistakes an issued card for a working one.

### A note on money movement

Lintel records payments and payout preferences — it does **not** charge
cards, collect mobile money, or transfer funds. Doing that requires a
merchant account with a payment provider (Paystack and Flutterwave are the
usual choices in Ghana) and their API keys. The subscription section is
likewise record-keeping only: nothing in the app is restricted based on
subscription status.

## Not yet built (next phases)

- Fine-grained accounting (VAT, withholding, formal statements/exports
  beyond the current CSV)
- Short-stay OTA sync (Airbnb/Booking.com) and dynamic pricing
- Automated late-payment reminders (email/SMS) — late payments are
  currently flagged, not yet messaged
- Actually processing payments (see "A note on money movement" above) —
  needs a payment provider integration and merchant account
- Password reset / invitation emails — staff accounts are created with a
  temporary password you share with the person directly
- Live door hardware integration (see "A note on door hardware")
- A tenant-facing portal (tenants can't log in to see their own statement)
- Document storage for signed lease agreements
- Rent escalation / annual review dates
- Search and filtering beyond the basics (fine at 3 units, painful at 300)
- Notifications — late payments and booking requests are recorded but
  nobody is emailed or texted about them
- Password reset and staff invitation emails
- A tenant-facing portal (tenants can't log in to see their own statement)
