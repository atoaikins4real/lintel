// EMAIL
//
// One send() interface with swappable adapters, so choosing a provider is
// a config change rather than a code change:
//
//   MAIL_PROVIDER=resend  MAIL_API_KEY=...            (recommended)
//   MAIL_PROVIDER=smtp    MAIL_SMTP_URL=smtp://...    (any host)
//   MAIL_PROVIDER unset                                -> console adapter
//
// The console adapter means the whole app works with no provider
// configured — password resets log their link to the server output so you
// can still test the flow. Nothing silently pretends to have sent mail.
//
// Two rules everywhere below:
//  1. Sending NEVER throws into the caller. A booking request must still
//     be saved even if the notification email fails; losing the customer's
//     enquiry because a mail server was down would be far worse.
//  2. Failures are logged loudly so they're diagnosable.

const PROVIDER = (process.env.MAIL_PROVIDER || '').toLowerCase();
const FROM = process.env.MAIL_FROM || 'Lintel <onboarding@resend.dev>';
const APP_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';

/** Minimal HTML wrapper so messages look deliberate rather than raw text. */
function wrap(title, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f5f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a8a29e;margin-bottom:14px">Lintel</div>
    <h1 style="font-size:20px;margin:0 0 14px">${title}</h1>
    ${bodyHtml}
  </div>
  <div style="max-width:520px;margin:14px auto 0;font-size:12px;color:#a8a29e;text-align:center">
    Sent by Lintel · Real Estate Management
  </div>
</body></html>`;
}

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function sendViaSmtp({ to, subject, html, text }) {
  // nodemailer is an optional dependency — only required when SMTP is
  // actually selected, so the package isn't needed for Resend or console.
  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch {
    throw new Error("MAIL_PROVIDER=smtp requires the 'nodemailer' package (npm i nodemailer)");
  }
  const transport = nodemailer.createTransport(process.env.MAIL_SMTP_URL);
  return transport.sendMail({ from: FROM, to, subject, html, text });
}

function sendViaConsole({ to, subject, text }) {
  console.log('\n--- EMAIL (no MAIL_PROVIDER configured — not actually sent) ---');
  console.log('to:      ', to);
  console.log('subject: ', subject);
  console.log(text);
  console.log('--------------------------------------------------------------\n');
  return Promise.resolve({ delivered: false, reason: 'no provider configured' });
}

/**
 * Sends an email. Resolves to { ok } — never rejects, so callers don't
 * need try/catch and a mail outage can't break the action that triggered
 * it.
 */
async function send({ to, subject, html, text, title }) {
  const payload = {
    to,
    subject,
    html: html || wrap(title || subject, `<p style="line-height:1.6">${text || ''}</p>`),
    text: text || subject,
  };

  try {
    if (!to) return { ok: false, error: 'no recipient' };

    if (PROVIDER === 'resend') {
      if (!process.env.MAIL_API_KEY) {
        console.warn('MAIL_PROVIDER=resend but MAIL_API_KEY is unset — falling back to console');
        await sendViaConsole(payload);
        return { ok: false, error: 'missing MAIL_API_KEY' };
      }
      await sendViaResend(payload);
      return { ok: true };
    }

    if (PROVIDER === 'smtp') {
      await sendViaSmtp(payload);
      return { ok: true };
    }

    await sendViaConsole(payload);
    return { ok: false, error: 'no provider configured' };
  } catch (err) {
    // Rule 1: never throw into the caller.
    console.error(`Email send failed (to=${to}, subject="${subject}"):`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

const button = (href, label) =>
  `<p style="margin:22px 0"><a href="${href}" style="background:#1c1917;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;display:inline-block">${label}</a></p>
   <p style="font-size:12px;color:#78716c;line-height:1.5">If the button doesn't work, paste this into your browser:<br>${href}</p>`;

// ---------------------------------------------------------------------
// Templates. Kept here so wording stays consistent and callers stay thin.
// ---------------------------------------------------------------------
const templates = {
  passwordReset: ({ name, resetUrl, expiresMinutes }) => ({
    subject: 'Reset your Lintel password',
    text: `Hi ${name || 'there'}, use this link to reset your Lintel password (valid for ${expiresMinutes} minutes): ${resetUrl}`,
    html: wrap(
      'Reset your password',
      `<p style="line-height:1.6">Hi ${name || 'there'},</p>
       <p style="line-height:1.6">Use the button below to set a new password. The link is valid for ${expiresMinutes} minutes and can only be used once.</p>
       ${button(resetUrl, 'Set a new password')}
       <p style="line-height:1.6;color:#78716c;font-size:13px">If you didn't ask for this, you can ignore this email — your password won't change.</p>`
    ),
  }),

  staffInvite: ({ name, companyName, email, password, loginUrl }) => ({
    subject: `You've been added to ${companyName} on Lintel`,
    text: `Hi ${name}, an account has been created for you on Lintel for ${companyName}. Sign in at ${loginUrl} with ${email} and this temporary password: ${password}`,
    html: wrap(
      `You've been added to ${companyName}`,
      `<p style="line-height:1.6">Hi ${name},</p>
       <p style="line-height:1.6">An account has been created for you on Lintel.</p>
       <p style="line-height:1.6">Username: <strong>${email}</strong><br>Temporary password: <strong>${password}</strong></p>
       ${button(loginUrl, 'Sign in')}
       <p style="line-height:1.6;color:#78716c;font-size:13px">Please change your password after signing in.</p>`
    ),
  }),

  bookingRequest: ({ unitLabel, name, email, phone, startDate, endDate, message, appUrl }) => ({
    subject: `New booking request — ${unitLabel}`,
    text: `${name} requested ${unitLabel}. Contact: ${[email, phone].filter(Boolean).join(', ')}. Dates: ${startDate || 'not given'} to ${endDate || 'open'}. ${message || ''}`,
    html: wrap(
      'New booking request',
      `<p style="line-height:1.6"><strong>${name}</strong> has requested <strong>${unitLabel}</strong>.</p>
       <p style="line-height:1.6">Contact: ${[email, phone].filter(Boolean).join(' · ') || 'none given'}<br>
       Dates: ${startDate || 'not given'} → ${endDate || 'open'}</p>
       ${message ? `<p style="line-height:1.6;font-style:italic">"${message}"</p>` : ''}
       ${button(`${appUrl}/booking-requests`, 'Review the request')}`
    ),
  }),

  latePayment: ({ tenantName, amount, dueDate, appUrl }) => ({
    subject: `Payment overdue — ${tenantName}`,
    text: `A payment of ${amount} from ${tenantName} was due on ${dueDate} and is now marked late.`,
    html: wrap(
      'Payment overdue',
      `<p style="line-height:1.6">A payment of <strong>${amount}</strong> from <strong>${tenantName}</strong> was due on ${dueDate} and has been marked late.</p>
       ${button(`${appUrl}/payments`, 'Open Payments')}`
    ),
  }),

  trialEnding: ({ companyName, daysLeft, appUrl }) => ({
    subject:
      daysLeft > 0
        ? `Your Lintel trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
        : 'Your Lintel trial has ended',
    text:
      daysLeft > 0
        ? `${companyName}'s Lintel trial ends in ${daysLeft} day(s). Get in touch to choose a plan.`
        : `${companyName}'s Lintel trial has ended. Your records stay readable; choose a plan to start adding again.`,
    html: wrap(
      daysLeft > 0 ? `Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Your trial has ended',
      `<p style="line-height:1.6">Hi ${companyName},</p>
       <p style="line-height:1.6">${
         daysLeft > 0
           ? 'Get in touch to choose a plan so nothing is interrupted.'
           : 'Everything you have entered stays readable — choosing a plan re-enables adding new records.'
       }</p>
       ${button(appUrl, 'Open Lintel')}`
    ),
  }),
};

module.exports = { send, templates, APP_URL, isConfigured: PROVIDER === 'resend' || PROVIDER === 'smtp' };
