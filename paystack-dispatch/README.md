# Paystack webhook dispatcher

One Paystack account, several apps (Lintel, Tractor, …). Paystack allows only
**one webhook URL per mode** (test / live), so this tiny service is that URL.
It verifies each event once and forwards it — untouched — to whichever app
owns the payment, decided by the payment's **reference prefix**.

It holds no data and has no build step: it's a single Netlify function.

## How routing works

Each app stamps its payment references with a unique prefix. Lintel uses
`LX-`. The dispatcher matches the incoming reference against `WEBHOOK_ROUTES`
and forwards to the first prefix that matches; anything unmatched goes to
`WEBHOOK_DEFAULT` (the incumbent app — e.g. Tractor).

Forwarding is safe because every app on this Paystack account shares the same
secret, so the original signature still verifies at the destination. The
dispatcher forwards the exact bytes and the original `x-paystack-signature`
header; each app re-verifies and ignores references that aren't its own.

## Deploy (once)

1. Put this folder in a Git repo (its own repo, or a subfolder of an existing
   one — set Netlify's **base directory** to this folder if it's a subfolder).
2. Create a **new Netlify site** from it. No build command; publish dir
   `public`; functions dir `netlify/functions` (already set in netlify.toml).
3. Set environment variables on that site (below).
4. In the Paystack dashboard, set the **webhook URL** for the relevant mode to
   `https://<this-site>.netlify.app/webhook`.

## Environment variables

| Variable | Example | Notes |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | `sk_live_…` / `sk_test_…` | The account secret for the mode this URL is registered under. |
| `WEBHOOK_ROUTES` | `{"LX-":"https://lintelapp.netlify.app/api/paystack/webhook"}` | JSON: reference-prefix → that app's webhook. Add one entry per app. |
| `WEBHOOK_DEFAULT` | `https://<tractor-domain>/api/paystack/webhook` | Where unmatched events go — usually the app that was on the webhook before. |

### Test vs live

Test and live are independent slots with independent secrets. Run one
dispatcher site per mode, or reuse one site and switch `PAYSTACK_SECRET_KEY`
plus the registered URL when you go live. Simplest is one site per mode.

## Adding another app later

Add a prefix and URL to `WEBHOOK_ROUTES`, redeploy. That's it — no code change.

## Failure behaviour

If a destination is unreachable or errors, the dispatcher returns 5xx so
Paystack retries the delivery later. Every destination app is idempotent, so a
retry never double-applies a payment. As a further backstop, apps should also
reconcile pending payments on a schedule (Lintel does — see its
`scheduledBilling` sweep), so a permanently missed webhook still self-heals.
