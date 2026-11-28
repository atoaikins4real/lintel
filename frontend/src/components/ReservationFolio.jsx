import { useEffect, useState } from 'react';
import { getPayments, createPayment, deletePayment, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { TextField } from './Field.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const nights = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A guest folio for one reservation: the room charge (nights × rate) plus any
// incidentals (minibar, laundry…), then the workspace's tax / service-charge
// lines, with a running total you settle at checkout. A "Save PDF" button
// prints a clean invoice. Incidentals are reservation-linked payments.
export default function ReservationFolio({ reservation, money, onClose }) {
  const { canEdit, company } = useAuth();
  const { settings } = useSettings();
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
  const subtotal = roomCharge + incidentalTotal;
  const taxLines = (settings?.taxes || [])
    .filter((t) => t.enabled !== false && Number(t.rate) > 0)
    .map((t) => ({ name: t.name, rate: Number(t.rate), amount: subtotal * (Number(t.rate) / 100) }));
  const taxTotal = taxLines.reduce((s, l) => s + l.amount, 0);
  const total = subtotal + taxTotal;

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

  const printInvoice = () => {
    const guest = r.guest_display || r.guest_name || 'Guest';
    const line = (label, value, strong) => `<tr><td style="padding:6px 0">${strong ? '<strong>' : ''}${esc(label)}${strong ? '</strong>' : ''}</td><td style="padding:6px 0;text-align:right">${strong ? '<strong>' : ''}${esc(value)}${strong ? '</strong>' : ''}</td></tr>`;
    const rows = [
      line(`Room · ${n} night${n === 1 ? '' : 's'} × ${money(r.nightly_rate || 0)}`, money(roomCharge)),
      ...charges.map((c) => line(c.notes || 'Incidental', money(c.amount))),
      line('Subtotal', money(subtotal)),
      ...taxLines.map((l) => line(`${l.name} (${l.rate}%)`, money(l.amount))),
    ].join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1b1b;max-width:640px;margin:40px auto;padding:0 24px}
      h1{font-size:22px;margin:0 0 2px}.muted{color:#777;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}
      td{border-bottom:1px solid #eee}.total td{border-top:2px solid #333;border-bottom:none;font-size:16px;padding-top:10px}</style></head>
      <body>
        <h1>${esc(company?.name || 'Lintel')}</h1>
        <div class="muted">Guest folio · ${esc(guest)}</div>
        <div class="muted">Room ${esc(r.unit_code || r.unit_id)} · ${esc(r.check_in)} → ${esc(r.check_out)}</div>
        <table>${rows}<tr class="total"><td>Total due</td><td style="text-align:right">${esc(money(total))}</td></tr></table>
        <p class="muted" style="margin-top:24px">Thank you for your stay.</p>
      </body></html>`;
    const w = window.open('', '_blank', 'width=720,height=800');
    if (!w) { setError('Allow pop-ups to print the invoice.'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 250);
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
          {taxLines.length > 0 && (
            <>
              <Row label="Subtotal" value={money(subtotal)} muted />
              {taxLines.map((l) => <Row key={l.name} label={`${l.name} (${l.rate}%)`} value={money(l.amount)} muted />)}
            </>
          )}
          <div className="flex items-center justify-between px-4 py-3 bg-panel/50">
            <span className="font-medium text-ink">Total due at checkout</span>
            <span className="font-bold text-ink">{money(total)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-4">
          <button type="button" onClick={printInvoice} className="lx-btn-ghost text-sm">Save PDF / print</button>
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

function Row({ label, value, action, muted }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
      <span className={`min-w-0 truncate ${muted ? 'text-stone' : 'text-stone'}`}>{label}</span>
      <span className={`flex items-center shrink-0 ${muted ? 'text-stone' : 'text-ink'}`}>{value}{action}</span>
    </div>
  );
}
