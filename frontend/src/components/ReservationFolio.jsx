import { useEffect, useState } from 'react';
import { getPayments, createPayment, deletePayment, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TextField } from './Field.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const nights = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));

// A guest folio for one reservation: the room charge (nights × rate) plus any
// incidentals (minibar, laundry…), with a running total you settle at checkout.
// Incidentals are stored as reservation-linked payments of type 'incidental'.
export default function ReservationFolio({ reservation, money, onClose }) {
  const { canEdit } = useAuth();
  const r = reservation;
  const [charges, setCharges] = useState([]);
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => getPayments({ reservation_id: r.id }).then(setCharges).catch((e) => setError(readApiError(e, 'load the folio')));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [r.id]);

  const n = nights(r.check_in, r.check_out);
  const roomCharge = Number(r.nightly_rate || 0) * n;
  const incidentalTotal = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  const total = roomCharge + incidentalTotal;

  const add = async (e) => {
    e.preventDefault();
    if (amt === '') return;
    setBusy(true); setError('');
    try {
      await createPayment({ reservation_id: r.id, amount: Number(amt), charge_type: 'incidental', notes: desc || 'Incidental', status: 'pending', due_date: iso(new Date()) });
      setDesc(''); setAmt(''); await load();
    } catch (err) { setError(readApiError(err, 'add that charge')); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    setBusy(true); setError('');
    try { await deletePayment(id); await load(); }
    catch (err) { setError(readApiError(err, 'remove that charge')); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg lx-card p-5 sm:p-6 max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-serif text-lg text-ink">Guest folio</h2>
          <button type="button" onClick={onClose} className="text-stone hover:text-ink text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-stone mb-4">
          {r.guest_display || r.guest_name || 'Guest'} · Room {r.unit_code || r.unit_id} · {r.check_in} → {r.check_out}
        </p>

        {error && <div className="mb-3 lx-alert lx-alert-danger">{error}</div>}

        <div className="rounded-xl border border-line/70 divide-y divide-line/60 mb-4 overflow-hidden">
          <Row label={`Room · ${n} night${n === 1 ? '' : 's'} × ${money(r.nightly_rate || 0)}`} value={money(roomCharge)} />
          {charges.map((c) => (
            <Row key={c.id} label={c.notes || 'Incidental'} value={money(c.amount)}
              action={canEdit && <button type="button" onClick={() => remove(c.id)} disabled={busy} className="text-xs text-stone hover:text-rose-600 ml-3">Remove</button>} />
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-panel/50">
            <span className="font-medium text-ink">Total due at checkout</span>
            <span className="font-bold text-ink">{money(total)}</span>
          </div>
        </div>

        {canEdit ? (
          <form onSubmit={add} className="flex items-end gap-2 flex-wrap">
            <TextField label="Add a charge" placeholder="e.g. Minibar" value={desc} onChange={(e) => setDesc(e.target.value)} className="flex-1 min-w-[150px]" />
            <input type="number" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} className="lx-input w-28" />
            <button disabled={busy} className="lx-btn-primary text-sm">{busy ? 'Adding…' : 'Add'}</button>
          </form>
        ) : (
          <p className="text-xs text-stone">Only a manager or finance user can add charges.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
      <span className="text-stone min-w-0 truncate">{label}</span>
      <span className="flex items-center text-ink shrink-0">{value}{action}</span>
    </div>
  );
}
