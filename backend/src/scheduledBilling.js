// Handler for the Netlify Scheduled Function that replaces the local
// node-cron job in production: generates this period's charges for active
// long-stay leases, flags overdue payments as late, then sends the
// notifications those two things imply. Schedule is declared in
// netlify.toml, not here (see [functions."scheduled-billing"]).
//
// Every notification step is wrapped so a mail failure can never stop the
// billing work that matters — charges and late flags are the job's real
// purpose; the emails are a courtesy on top.
const { generateCharges, flagLatePayments } = require('./utils/billing');
const { supabase } = require('./config/supabase');
const mailer = require('./utils/mailer');
const paystack = require('./utils/paystack');
const { reconcilePaystackData } = require('./utils/reconcile');
const { mintPortalToken } = require('./utils/portalToken');

// Money for a tenant-facing line: currency code + grouped amount. Never adds
// across currencies — each payment carries its own.
const money = (amount, currency) => `${currency || 'GHS'} ${Number(amount || 0).toLocaleString()}`;

/**
 * Fetch the per-company reminder switch, tenant contact, and company name for
 * a set of payments in three batched reads (not one per payment).
 */
async function reminderContext(payments) {
  const companyIds = [...new Set(payments.map((p) => p.company_id).filter(Boolean))];
  const tenantIds = [...new Set(payments.map((p) => p.tenant_id).filter(Boolean))];
  const [{ data: settings }, { data: tenants }, { data: companies }] = await Promise.all([
    companyIds.length
      ? supabase.from('l_settings').select('company_id, tenant_reminders_enabled').in('company_id', companyIds)
      : { data: [] },
    tenantIds.length
      ? supabase.from('l_tenants').select('id, company_id, first_name, email').in('id', tenantIds).in('company_id', companyIds)
      : { data: [] },
    companyIds.length ? supabase.from('l_companies').select('id, name').in('id', companyIds) : { data: [] },
  ]);
  return {
    // Default ON: a company with no settings row still gets the courtesy.
    remindersOn: Object.fromEntries((settings || []).map((s) => [s.company_id, s.tenant_reminders_enabled !== false])),
    tenantById: Object.fromEntries((tenants || []).map((t) => [t.id, t])),
    companyById: Object.fromEntries((companies || []).map((c) => [c.id, c])),
  };
}

/**
 * Email each tenant behind these payments, deep-linked to their statement,
 * then stamp the payment so it isn't re-sent. `kind` is 'due' or 'overdue'.
 * Only stamps on a successful send, so a transient mail outage retries next
 * night rather than silently swallowing the reminder.
 */
async function sendReminderBatch(payments, kind) {
  if (!payments.length) return 0;
  const { remindersOn, tenantById, companyById } = await reminderContext(payments);
  const stampField = kind === 'due' ? 'due_reminder_at' : 'overdue_reminder_at';
  const template = kind === 'due' ? templates.tenantRentDue : templates.tenantRentOverdue;
  const nowIso = new Date().toISOString();
  let sent = 0;

  for (const p of payments) {
    if (remindersOn[p.company_id] === false) continue; // subscriber turned it off
    const tenant = tenantById[p.tenant_id];
    if (!tenant?.email || !tenant.email.includes('@')) continue; // nowhere to send

    // A fresh, expiring link straight to their statement (where they can pay).
    // If minting fails, fall back to the "request a link" page rather than skip.
    let statementUrl = `${mailer.APP_URL}/my-statement`;
    try {
      const raw = await mintPortalToken(p.company_id, p.tenant_id);
      statementUrl += `?token=${raw}`;
    } catch (err) {
      console.error('[scheduled-billing] portal token mint failed:', err?.message || err);
    }

    const result = await mailer.send({
      to: tenant.email,
      ...template({
        firstName: tenant.first_name,
        amount: money(p.amount, p.currency),
        dueDate: p.due_date || 'soon',
        companyName: companyById[p.company_id]?.name,
        statementUrl,
      }),
    });

    if (result.ok) {
      await supabase.from('l_payments').update({ [stampField]: nowIso }).eq('id', p.id).eq('company_id', p.company_id);
      sent += 1;
    }
  }
  return sent;
}

const { templates } = mailer;
const isoDay = (d) => d.toISOString().slice(0, 10);

/** "Rent due soon" — once, for pending charges due within 3 days. */
async function remindTenantsRentDue() {
  if (!mailer.isConfigured) return 0;
  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 3);
  const { data } = await supabase
    .from('l_payments')
    .select('id, company_id, tenant_id, amount, currency, due_date')
    .eq('status', 'pending')
    .gte('due_date', isoDay(today))
    .lte('due_date', isoDay(soon))
    .is('due_reminder_at', null);
  return sendReminderBatch(data || [], 'due');
}

/** "Rent overdue" — weekly, for late/pending charges past their due date. */
async function remindTenantsOverdue() {
  if (!mailer.isConfigured) return 0;
  const today = new Date();
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from('l_payments')
    .select('id, company_id, tenant_id, amount, currency, due_date, overdue_reminder_at')
    .in('status', ['late', 'pending'])
    .lt('due_date', isoDay(today))
    .or(`overdue_reminder_at.is.null,overdue_reminder_at.lt.${weekAgoIso}`);
  return sendReminderBatch(data || [], 'overdue');
}

/**
 * Confirms online payments that never got a webhook.
 *
 * The Paystack webhook is the fast path, but it can be missed — a tenant on
 * one Paystack account shared by several apps may have events routed
 * elsewhere, a forward can drop, a function can cold-start past a timeout.
 * So this is the backstop: every run, take each payment attempt still sitting
 * at "initialized", ask Paystack directly whether it actually succeeded, and
 * reconcile it. Reconciliation is idempotent, so this can never double-pay or
 * fight the webhook — whichever confirms first wins, the other no-ops.
 *
 * Cross-company by design, exactly like the charge/late-flag work above; the
 * audit-scoping allow-list names this file for that reason. Each row is then
 * settled through reconcilePaystackData, which scopes every write by the
 * company on the transaction itself.
 */
async function reconcilePendingOnlinePayments() {
  if (!paystack.isConfigured()) return 0;

  const now = Date.now();
  // Give the instant paths (webhook, redirect-verify) a couple of minutes
  // before chasing it, and stop after 3 days — by then Paystack treats an
  // unfinished checkout as abandoned and the tenant would simply start again.
  const settledFloor = new Date(now - 2 * 60 * 1000).toISOString();
  const staleFloor = new Date(now - 3 * 86400000).toISOString();

  const { data: pending } = await supabase
    .from('l_payment_transactions')
    .select('reference')
    .eq('status', 'initialized')
    .lt('created_at', settledFloor)
    .gt('created_at', staleFloor);

  let settled = 0;
  for (const row of pending || []) {
    try {
      const data = await paystack.verifyTransaction(row.reference);
      const result = await reconcilePaystackData(data);
      if (result.outcome === 'reconciled') settled += 1;
    } catch (err) {
      console.error('[scheduled-billing] verify failed for', row.reference, err?.message || err);
    }
  }
  return settled;
}

/** Emails each company about payments just flagged late. */
async function notifyLatePayments(flaggedIds) {
  if (!flaggedIds?.length) return 0;

  const { data: payments } = await supabase
    .from('l_payments')
    .select('id, amount, currency, due_date, company_id, l_tenants(first_name, last_name)')
    .in('id', flaggedIds);
  if (!payments?.length) return 0;

  // Group by company so one company gets one email per payment rather
  // than seeing anything belonging to anyone else.
  const byCompany = payments.reduce((acc, p) => {
    (acc[p.company_id] = acc[p.company_id] || []).push(p);
    return acc;
  }, {});

  let sent = 0;
  for (const [companyId, items] of Object.entries(byCompany)) {
    const { data: staff } = await supabase
      .from('l_users')
      .select('email')
      .eq('company_id', companyId)
      .in('role', ['manager', 'finance']);

    const recipients = (staff || []).map((s) => s.email).filter((e) => e?.includes('@'));
    if (!recipients.length) continue;

    for (const p of items) {
      const tenantName = p.l_tenants
        ? `${p.l_tenants.first_name} ${p.l_tenants.last_name}`
        : 'a tenant';
      const result = await mailer.send({
        to: recipients,
        ...mailer.templates.latePayment({
          tenantName,
          amount: `${p.currency} ${Number(p.amount).toLocaleString()}`,
          dueDate: p.due_date,
          appUrl: mailer.APP_URL,
        }),
      });
      if (result.ok) sent += 1;
    }
  }
  return sent;
}

/**
 * Warns subscribers whose subscription is about to end — trials AND paid
 * renewals. Previously only trials were covered, so a paying customer's
 * first indication of a renewal was the charge itself.
 *
 * Fires on exactly 7, 3 and 1 days out (plus the day itself for trials,
 * which actually expire), so nobody is emailed daily for a month.
 *
 * The operator gets one digest covering every subscriber in the window,
 * rather than a copy of each individual email.
 */
async function notifyExpiringSubscriptions() {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const dayFromNow = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const trialDates = [dayFromNow(7), dayFromNow(3), dayFromNow(1), iso(today)];
  // A renewal isn't an expiry — there's nothing to warn about on the day
  // itself, so paid plans get the run-up only.
  const renewalDates = [dayFromNow(7), dayFromNow(3), dayFromNow(1)];

  const [{ data: trials }, { data: renewals }] = await Promise.all([
    supabase
      .from('l_subscriptions')
      .select('company_id, trial_ends_on, status, amount, currency, l_companies(name, email), l_plans(name)')
      .eq('status', 'trial')
      .in('trial_ends_on', trialDates),
    supabase
      .from('l_subscriptions')
      .select('company_id, renews_on, status, amount, currency, l_companies(name, email), l_plans(name)')
      .eq('status', 'active')
      .in('renews_on', renewalDates),
  ]);

  const daysUntil = (date) => Math.round((new Date(date) - new Date(iso(today))) / 86400000);

  /** Company contact address, falling back to its managers. */
  const recipientsFor = async (sub) => {
    if (sub.l_companies?.email?.includes('@')) return [sub.l_companies.email];
    const { data: staff } = await supabase
      .from('l_users')
      .select('email')
      .eq('company_id', sub.company_id)
      .eq('role', 'manager');
    return (staff || []).map((s) => s.email).filter((e) => e?.includes('@'));
  };

  let sent = 0;
  const digest = [];

  for (const sub of trials || []) {
    const daysLeft = daysUntil(sub.trial_ends_on);
    const companyName = sub.l_companies?.name || 'there';
    digest.push({ companyName, kind: 'trial', date: sub.trial_ends_on, daysLeft });

    const recipients = await recipientsFor(sub);
    if (!recipients.length) continue;
    const result = await mailer.send({
      to: recipients,
      ...mailer.templates.trialEnding({ companyName, daysLeft, appUrl: mailer.APP_URL }),
    });
    if (result.ok) sent += 1;
  }

  for (const sub of renewals || []) {
    const daysLeft = daysUntil(sub.renews_on);
    const companyName = sub.l_companies?.name || 'there';
    digest.push({
      companyName,
      kind: 'renewal',
      date: sub.renews_on,
      daysLeft,
      amount: sub.amount,
      currency: sub.currency,
    });

    const recipients = await recipientsFor(sub);
    if (!recipients.length) continue;
    const result = await mailer.send({
      to: recipients,
      ...mailer.templates.renewalUpcoming({
        companyName,
        daysLeft,
        renewsOn: sub.renews_on,
        amount: sub.amount,
        currency: sub.currency,
        planName: sub.l_plans?.name,
        appUrl: mailer.APP_URL,
      }),
    });
    if (result.ok) sent += 1;
  }

  await notifyOperator(digest);
  return sent;
}

/**
 * One digest to whoever runs Lintel.
 *
 * OPERATOR_EMAIL is the configured route. The fallback to platform-admin
 * accounts exists because those accounts may legitimately be usernames
 * rather than addresses (ours are), in which case there is simply nobody
 * to email — so this returns quietly instead of pretending it sent.
 */
async function notifyOperator(items) {
  if (!items.length) return false;

  let recipients = (process.env.OPERATOR_EMAIL || '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  if (!recipients.length) {
    const { data: admins } = await supabase
      .from('l_users')
      .select('email')
      .eq('is_platform_admin', true);
    recipients = (admins || []).map((a) => a.email).filter((e) => e?.includes('@'));
  }

  if (!recipients.length) {
    console.log(
      `[scheduled-billing] ${items.length} subscription(s) need attention but no operator address ` +
        'is configured — set OPERATOR_EMAIL to receive this digest.'
    );
    return false;
  }

  const result = await mailer.send({
    to: recipients,
    ...mailer.templates.operatorDigest({ items, appUrl: mailer.APP_URL }),
  });
  return result.ok;
}

exports.handler = async function scheduledBillingHandler() {
  try {
    const gen = await generateCharges();
    const late = await flagLatePayments();

    // Notifications are best-effort — billing has already succeeded by
    // this point and must not be reported as failed if mail is down.
    let lateEmails = 0;
    let subscriptionEmails = 0;
    let onlineSettled = 0;
    try {
      lateEmails = await notifyLatePayments(late.ids);
    } catch (err) {
      console.error('[scheduled-billing] late-payment emails failed:', err?.message || err);
    }
    try {
      subscriptionEmails = await notifyExpiringSubscriptions();
    } catch (err) {
      console.error('[scheduled-billing] subscription-expiry emails failed:', err?.message || err);
    }
    try {
      onlineSettled = await reconcilePendingOnlinePayments();
    } catch (err) {
      console.error('[scheduled-billing] online-payment reconcile failed:', err?.message || err);
    }

    // Tenant-facing reminders — best-effort, after the money work is done.
    let dueReminders = 0;
    let overdueReminders = 0;
    try {
      dueReminders = await remindTenantsRentDue();
    } catch (err) {
      console.error('[scheduled-billing] rent-due reminders failed:', err?.message || err);
    }
    try {
      overdueReminders = await remindTenantsOverdue();
    } catch (err) {
      console.error('[scheduled-billing] overdue reminders failed:', err?.message || err);
    }

    console.log(
      `[scheduled-billing] generated ${gen.generated_count} charge(s), flagged ${late.flagged_count} late, ` +
        `settled ${onlineSettled} online payment(s), reminded ${dueReminders} due + ${overdueReminders} overdue tenant(s), ` +
        `sent ${lateEmails} late-payment and ${subscriptionEmails} subscription email(s)`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generated: gen.generated_count,
        flagged: late.flagged_count,
        online_settled: onlineSettled,
        tenant_due_reminders: dueReminders,
        tenant_overdue_reminders: overdueReminders,
        late_emails: lateEmails,
        subscription_emails: subscriptionEmails,
      }),
    };
  } catch (err) {
    console.error('[scheduled-billing] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};

// Exported for testing — the sweep is exercised directly rather than through
// the whole handler (which also runs billing).
exports.reconcilePendingOnlinePayments = reconcilePendingOnlinePayments;
exports.remindTenantsRentDue = remindTenantsRentDue;
exports.remindTenantsOverdue = remindTenantsOverdue;
