// PAYSTACK
//
// One platform-owned integration. The secret key lives ONLY in the server
// environment (PAYSTACK_SECRET_KEY) — never in the database, never sent to a
// browser. Each subscriber links a mobile-money or bank account, which the
// server registers here as a *subaccount*; a tenant's payment is initialized
// against that subaccount so Paystack settles the money straight to the
// subscriber. Lintel is never in custody of the funds.
//
// Everything here is a thin wrapper over Paystack's REST API. Nothing throws
// a raw fetch/JSON error at a caller — failures come back as Error objects
// with a message safe to log, so the routes can decide what the tenant or
// subscriber sees.
//
// Test vs live is purely which secret key is configured: a key starting
// `sk_test_` talks to Paystack's test environment, `sk_live_` to production.
// The code is identical either way.

const crypto = require('crypto');

const BASE = 'https://api.paystack.co';

// Currencies Paystack can actually settle. A lease agreed in EUR/GBP is real
// in Lintel but cannot be collected through Paystack — the caller must catch
// this and fall back to manual entry rather than initialize a doomed payment.
const PAYSTACK_CURRENCIES = ['GHS', 'NGN', 'ZAR', 'KES', 'USD'];

const secretKey = () => process.env.PAYSTACK_SECRET_KEY || '';
const publicKey = () => process.env.PAYSTACK_PUBLIC_KEY || '';

// True once the platform has configured its keys. Until then every call here
// refuses loudly instead of hitting Paystack unauthenticated.
const isConfigured = () => Boolean(secretKey());

function currencySupported(code) {
  return PAYSTACK_CURRENCIES.includes(String(code || '').toUpperCase());
}

// Paystack amounts are in the currency's MINOR unit (pesewas, kobo, cents):
// GHS 12.50 -> 1250. Rounded to a whole minor unit because Paystack rejects
// fractional minor units, and a lease rate is only ever 2 decimal places.
function toMinorUnits(amountMajor) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number');
  return Math.round(n * 100);
}

function fromMinorUnits(amountMinor) {
  return Number(amountMinor || 0) / 100;
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) {
    throw new Error('Online payments are not configured on this server (PAYSTACK_SECRET_KEY is unset).');
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    // A network failure reaching Paystack is transient — say so plainly.
    throw new Error(`Could not reach Paystack: ${netErr?.message || netErr}`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Paystack returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (!res.ok || json?.status === false) {
    // Paystack puts a human message in `message`. Surface it; it's safe.
    throw new Error(json?.message || `Paystack request failed (HTTP ${res.status}).`);
  }
  return json.data;
}

/**
 * Start a payment. Returns { authorization_url, access_code, reference }.
 * `subaccount` routes settlement to the subscriber; `bearer: 'subaccount'`
 * makes the subscriber bear Paystack's fee, so the platform takes nothing
 * unless a fee is deliberately configured later.
 */
async function initializeTransaction({ email, amountMajor, currency, reference, callbackUrl, subaccount, metadata }) {
  const cur = String(currency || 'GHS').toUpperCase();
  if (!currencySupported(cur)) {
    throw new Error(`Paystack cannot collect ${cur}. Supported: ${PAYSTACK_CURRENCIES.join(', ')}.`);
  }
  const payload = {
    email,
    amount: toMinorUnits(amountMajor),
    currency: cur,
    reference,
    callback_url: callbackUrl,
    metadata,
  };
  if (subaccount) {
    payload.subaccount = subaccount;
    payload.bearer = 'subaccount';
  }
  return paystackFetch('/transaction/initialize', { method: 'POST', body: payload });
}

/** Confirm a transaction by reference. Returns Paystack's transaction data. */
async function verifyTransaction(reference) {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/**
 * Register (or re-register) a subscriber's settlement destination.
 * `settlementBank` is a Paystack bank/mobile-money code and `accountNumber`
 * is the bank account number or the mobile-money phone number. Returns the
 * subaccount data (including subaccount_code).
 */
async function createSubaccount({ businessName, settlementBank, accountNumber, percentageCharge = 0, primaryContactEmail, primaryContactPhone }) {
  return paystackFetch('/subaccount', {
    method: 'POST',
    body: {
      business_name: businessName,
      settlement_bank: settlementBank,
      account_number: accountNumber,
      percentage_charge: percentageCharge,
      primary_contact_email: primaryContactEmail,
      primary_contact_phone: primaryContactPhone,
    },
  });
}

async function updateSubaccount(code, { businessName, settlementBank, accountNumber, active }) {
  const body = {};
  if (businessName !== undefined) body.business_name = businessName;
  if (settlementBank !== undefined) body.settlement_bank = settlementBank;
  if (accountNumber !== undefined) body.account_number = accountNumber;
  if (active !== undefined) body.active = active;
  return paystackFetch(`/subaccount/${encodeURIComponent(code)}`, { method: 'PUT', body });
}

/**
 * Banks / mobile-money providers a subscriber can settle to, for the picker.
 * e.g. listBanks({ country: 'ghana', currency: 'GHS', type: 'mobile_money' }).
 */
async function listBanks({ country = 'ghana', currency, type } = {}) {
  const qs = new URLSearchParams();
  if (country) qs.set('country', country);
  if (currency) qs.set('currency', currency);
  if (type) qs.set('type', type);
  return paystackFetch(`/bank?${qs.toString()}`);
}

/**
 * Verify a webhook came from Paystack. Paystack signs the RAW request body
 * with HMAC-SHA512 keyed by the secret key and sends it as
 * `x-paystack-signature`. We must hash the exact bytes received — hence the
 * webhook route reads a raw body, not parsed JSON. Compared in constant time.
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!isConfigured() || !signature) return false;
  const expected = crypto.createHmac('sha512', secretKey()).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  PAYSTACK_CURRENCIES,
  isConfigured,
  publicKey,
  currencySupported,
  toMinorUnits,
  fromMinorUnits,
  initializeTransaction,
  verifyTransaction,
  createSubaccount,
  updateSubaccount,
  listBanks,
  verifyWebhookSignature,
};
