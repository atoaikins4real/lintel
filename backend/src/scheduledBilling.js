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
 * Warns companies whose trial ends in 7 days, 3 days, 1 day, or ended
 * today. Only those exact days, so nobody is emailed daily for a month.
 */
async function notifyExpiringTrials() {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const dayFromNow = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  const targetDates = [dayFromNow(7), dayFromNow(3), dayFromNow(1), iso(today)];

  const { data: subs } = await supabase
    .from('l_subscriptions')
    .select('company_id, trial_ends_on, status, l_companies(name, email)')
    .eq('status', 'trial')
    .in('trial_ends_on', targetDates);

  let sent = 0;
  for (const sub of subs || []) {
    // Prefer the company's contact address; fall back to its managers.
    let recipients = sub.l_companies?.email?.includes('@') ? [sub.l_companies.email] : [];
    if (!recipients.length) {
      const { data: staff } = await supabase
        .from('l_users')
        .select('email')
        .eq('company_id', sub.company_id)
        .eq('role', 'manager');
      recipients = (staff || []).map((s) => s.email).filter((e) => e?.includes('@'));
    }
    if (!recipients.length) continue;

    const daysLeft = Math.round(
      (new Date(sub.trial_ends_on) - new Date(iso(today))) / 86400000
    );

    const result = await mailer.send({
      to: recipients,
      ...mailer.templates.trialEnding({
        companyName: sub.l_companies?.name || 'there',
        daysLeft,
        appUrl: mailer.APP_URL,
      }),
    });
    if (result.ok) sent += 1;
  }
  return sent;
}

exports.handler = async function scheduledBillingHandler() {
  try {
    const gen = await generateCharges();
    const late = await flagLatePayments();

    // Notifications are best-effort — billing has already succeeded by
    // this point and must not be reported as failed if mail is down.
    let lateEmails = 0;
    let trialEmails = 0;
    try {
      lateEmails = await notifyLatePayments(late.ids);
    } catch (err) {
      console.error('[scheduled-billing] late-payment emails failed:', err?.message || err);
    }
    try {
      trialEmails = await notifyExpiringTrials();
    } catch (err) {
      console.error('[scheduled-billing] trial-expiry emails failed:', err?.message || err);
    }

    console.log(
      `[scheduled-billing] generated ${gen.generated_count} charge(s), flagged ${late.flagged_count} late, ` +
        `sent ${lateEmails} late-payment and ${trialEmails} trial email(s)`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        generated: gen.generated_count,
        flagged: late.flagged_count,
        late_emails: lateEmails,
        trial_emails: trialEmails,
      }),
    };
  } catch (err) {
    console.error('[scheduled-billing] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
