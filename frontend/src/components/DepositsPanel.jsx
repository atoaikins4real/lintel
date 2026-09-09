import { useEffect, useState } from 'react';
import { getDeposits, createDeposit, deductDeposit, refundDeposit, readApiError } from '../api/client.js';
import { formatMoney } from '../utils/currency.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TextField } from './Field.jsx';

// Security deposits held for one tenant, with their running balance and the
// hold / deduct / refund ledger. Deposits are a liability — money owed back —
// so this is deliberately separate from the tenant's rent payments.
const STATUS = {
  held: { label: 'Held', cls: 'bg-emerald-50 text-emerald-700' },
  partially_returned: { label: 'Partly returned', cls: 'bg-amber-50 text-amber-700' },
  returned: { label: 'Returned', cls: 'bg-stone/10 text-stone' },
  forfeited: { label: 'Forfeited', cls: 'bg-rose-50 text-rose-700' },
};

export default function DepositsPanel({ tenantId }) {
  const { canEdit } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'GHS', notes: '' });
  const [busy, setBusy] = useState(false);

  const load = () =>
    getDeposits({ tenant_id: tenantId })
      .then(setDeposits)
      .catch((err) => setError(readApiError(err, 'load deposits')));

  useEffect(() => {
    if (tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const record = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createDeposit({ tenant_id: tenantId, amount: form.amount, currency: form.currency, notes: form.notes });
      setForm({ amount: '', currency: 'GHS', notes: '' });
      setAdding(false);
      load();
    } catch (err) {
      setError(readApiError(err, 'record the deposit'));
    } finally {
      setBusy(false);
    }
  };

  const held = deposits.filter((d) => d.balance > 0).reduce((s, d) => s + d.balance, 0);

  return (
    <div className="lx-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-serif text-lg text-ink">Security deposits</div>
          {deposits.length > 0 && (
            <div className="text-xs text-stone mt-0.5">
              {formatMoney(held, deposits[0]?.currency || 'GHS')} currently held
            </div>
          )}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setAdding((s) => !s)} className="lx-btn-ghost text-sm px-3 py-1.5">
            {adding ? 'Cancel' : 'Record deposit'}
          </button>
        )}
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 mb-3">{error}</div>}

      {adding && canEdit && (
        <form onSubmit={record} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 pb-4 border-b border-line/70">
          <TextField label="Amount" type="number" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <TextField label="Currency" value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          <TextField label="Note (optional)" className="sm:col-span-2" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button disabled={busy} className="lx-btn-gold sm:col-span-2 justify-self-start w-full sm:w-auto">
            {busy ? 'Saving…' : 'Record deposit'}
          </button>
        </form>
      )}

      {deposits.length === 0 ? (
        <p className="text-sm text-stone">No deposits recorded.</p>
      ) : (
        <div className="space-y-3">
          {deposits.map((d) => (
            <DepositRow key={d.id} deposit={d} canEdit={canEdit} onChange={load} onError={setError} />
          ))}
        </div>
      )}
    </div>
  );
}

function DepositRow({ deposit: d, canEdit, onChange, onError }) {
  const [action, setAction] = useState(null); // 'deduct' | 'refund' | null
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const st = STATUS[d.status] || STATUS.held;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      const fn = action === 'deduct' ? deductDeposit : refundDeposit;
      await fn(d.id, { amount, reason });
      setAction(null);
      setAmount('');
      setReason('');
      onChange();
    } catch (err) {
      onError(readApiError(err, `${action} from the deposit`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-line rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-ink num">{formatMoney(d.balance, d.currency)} <span className="text-xs font-normal text-stone">held</span></div>
          <div className="text-xs text-stone mt-0.5">
            {formatMoney(d.amount, d.currency)} received {d.received_on}
            {d.deducted > 0 && <> · {formatMoney(d.deducted, d.currency)} deducted</>}
            {d.refunded > 0 && <> · {formatMoney(d.refunded, d.currency)} refunded</>}
          </div>
        </div>
        <span className={`pill ${st.cls}`}>{st.label}</span>
      </div>

      {d.entries?.length > 1 && (
        <ul className="mt-3 pt-3 border-t border-line/60 space-y-1.5 text-xs text-stone">
          {d.entries.map((e) => (
            <li key={e.id} className="flex justify-between gap-3">
              <span className="capitalize">{e.kind}{e.reason ? ` — ${e.reason}` : ''}</span>
              <span className="num">{formatMoney(e.amount, d.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && d.balance > 0 && (
        <div className="mt-3 pt-3 border-t border-line/60">
          {!action ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setAction('deduct')} className="lx-btn-ghost text-xs px-3 py-1.5">Deduct</button>
              <button type="button" onClick={() => setAction('refund')} className="lx-btn-ghost text-xs px-3 py-1.5">Refund</button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <TextField label={`${action === 'deduct' ? 'Deduct' : 'Refund'} amount`} type="number" required value={amount}
                onChange={(e) => setAmount(e.target.value)} />
              <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="sm:col-span-2 flex gap-2">
                <button disabled={busy} className="lx-btn-primary text-xs px-3 py-1.5">
                  {busy ? 'Saving…' : action === 'deduct' ? 'Deduct' : 'Refund'}
                </button>
                <button type="button" onClick={() => setAction(null)} className="lx-btn-ghost text-xs px-3 py-1.5">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
