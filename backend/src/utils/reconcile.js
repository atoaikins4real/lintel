// RECONCILIATION
//
// The single place a Paystack "this transaction succeeded" fact turns into a
// paid charge in Lintel. Both paths call this — the webhook (Paystack pushing
// the event) and the redirect-verify (the tenant landing back on their
// statement) — so no matter which arrives first, a charge is marked paid
// exactly once.
//
// Idempotency has two guards working together: the transaction row's own
// status (already 'success' -> nothing to do) and the unique index on
// l_payments(company_id, gateway_reference). Even a duplicate webhook, or a
// webhook racing the redirect, cannot double-pay.
//
// This function TRUSTS its `data` argument — the caller must have verified it
// first (webhook signature, or a fresh verifyTransaction). It never calls
// Paystack itself.
const { supabase } = require('../config/supabase');
const paystack = require('./paystack');

// Paystack's channel -> the method vocabulary l_payments already uses.
function mapChannel(channel) {
  switch (String(channel || '').toLowerCase()) {
    case 'mobile_money':
      return 'mobile_money';
    case 'card':
      return 'card';
    case 'bank':
    case 'bank_transfer':
    case 'dedicated_nuban':
      return 'bank_transfer';
    default:
      return channel || 'online';
  }
}

/**
 * Apply a verified Paystack transaction to Lintel's records.
 *
 * @param {object} data - a verified Paystack transaction object
 *   ({ reference, status, amount, currency, channel, ... }).
 * @returns {object} one of:
 *   { outcome: 'ignored' }        - reference isn't one of ours
 *   { outcome: 'already_done' }   - transaction was already reconciled
 *   { outcome: 'mismatch' }       - amount/currency didn't match; flagged, not paid
 *   { outcome: 'not_success', status } - transaction failed/abandoned; recorded
 *   { outcome: 'reconciled', payment_id } - charge marked paid
 */
async function reconcilePaystackData(data) {
  const reference = data?.reference;
  if (!reference) return { outcome: 'ignored' };

  // Find OUR record of this attempt. If we never initialized it, it isn't a
  // Lintel rent payment (could be a subscription charge, or noise) — ignore.
  const { data: txn } = await supabase
    .from('l_payment_transactions')
    .select('id, company_id, payment_id, tenant_id, amount, currency, status')
    .eq('reference', reference)
    .maybeSingle();

  if (!txn) return { outcome: 'ignored' };
  if (txn.status === 'success') return { outcome: 'already_done', payment_id: txn.payment_id };

  const gatewayStatus = String(data.status || '').toLowerCase();

  // Not a success event (failed / abandoned). Record it and stop — never
  // mark a charge paid off anything but a genuine success.
  if (gatewayStatus !== 'success') {
    const status = gatewayStatus === 'failed' ? 'failed' : 'abandoned';
    await supabase
      .from('l_payment_transactions')
      .update({ status, gateway_response: data })
      .eq('id', txn.id)
      .eq('company_id', txn.company_id);
    return { outcome: 'not_success', status };
  }

  // Success — but confirm the money that moved is the money we asked for.
  // A mismatch means someone replayed a reference against a different charge,
  // or Paystack sent an amount we didn't expect. Flag it; do NOT pay.
  const expectedMinor = paystack.toMinorUnits(txn.amount);
  const gotMinor = Number(data.amount);
  const sameCurrency = String(data.currency || '').toUpperCase() === String(txn.currency || '').toUpperCase();
  if (gotMinor !== expectedMinor || !sameCurrency) {
    await supabase
      .from('l_payment_transactions')
      .update({ status: 'failed', gateway_response: { mismatch: true, ...data } })
      .eq('id', txn.id)
      .eq('company_id', txn.company_id);
    return { outcome: 'mismatch' };
  }

  const nowIso = new Date().toISOString();

  // Mark the attempt settled first. The unique index on the payment's
  // gateway_reference is the real backstop against double payment below.
  await supabase
    .from('l_payment_transactions')
    .update({ status: 'success', channel: data.channel, paid_at: nowIso, gateway_response: data })
    .eq('id', txn.id)
    .eq('company_id', txn.company_id);

  // Settle the charge itself, scoped to the transaction's company.
  if (txn.payment_id) {
    await supabase
      .from('l_payments')
      .update({
        status: 'paid',
        payment_date: nowIso.slice(0, 10),
        method: mapChannel(data.channel),
        gateway: 'paystack',
        gateway_reference: reference,
        reference,
      })
      .eq('id', txn.payment_id)
      .eq('company_id', txn.company_id);
  }

  return { outcome: 'reconciled', payment_id: txn.payment_id };
}

module.exports = { reconcilePaystackData, mapChannel };
