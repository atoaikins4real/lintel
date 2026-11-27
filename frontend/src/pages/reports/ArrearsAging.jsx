import { useEffect, useState } from 'react';
import { getArrearsAging, createPayment, readApiError } from '../../api/client.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { downloadCsv } from '../../utils/csv.js';

const iso = (d) => d.toISOString().slice(0, 10);

// Overdue rent, aged into 0-30 / 31-60 / 61-90 / 90+ day buckets per tenancy —
// a collections view, worst-first. Managers can add a late fee to a tenancy,
// which posts a `late_fee` charge due today.
export default function ArrearsAging() {
  const { money } = useSettings();
  const { canEdit } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [feeFor, setFeeFor] = useState(null);
  const [feeAmt, setFeeAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getArrearsAging().then(setData).catch((e) => setError(readApiError(e, 'load arrears')));
  useEffect(() => { load(); }, []);

  const chargeFee = async (row) => {
    if (!row.lease_id || feeAmt === '') return;
    setBusy(true); setError('');
    try {
      await createPayment({ lease_id: row.lease_id, amount: Number(feeAmt), charge_type: 'late_fee', due_date: iso(new Date()), status: 'pending', notes: 'Late fee' });
      setFeeFor(null); setFeeAmt(''); await load();
    } catch (err) { setError(readApiError(err, 'charge the late fee')); }
    finally { setBusy(false); }
  };

  if (error) return <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>;
  if (!data) return <p className="text-stone text-sm">Loading…</p>;

  const rows = data.rows || [];
  const t = data.totals || {};

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
          <Stat label="Tenancies in arrears" value={data.tenancies_in_arrears} />
          <Stat label="Total overdue" value={money(t.total)} tone={t.total > 0 ? 'bad' : null} />
          <Stat label="90+ days" value={money(t.d90_plus)} tone={t.d90_plus > 0 ? 'bad' : null} />
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => downloadCsv('arrears-aging.csv',
              ['Tenant', 'Lintel ID', 'Contact', 'Property', 'Unit', '0-30', '31-60', '61-90', '90+', 'Total', 'Oldest (days)'],
              rows.map((r) => [r.tenant, r.lintel_id || '', r.contact || '', r.property, r.unit, r.d0_30, r.d31_60, r.d61_90, r.d90_plus, r.total, r.oldest_days]))}
            className="lx-btn-ghost text-xs"
          >
            Export CSV
          </button>
        )}
      </div>

      <p className="text-xs text-stone mb-4">
        Overdue charges grouped by how long they’ve been outstanding. Totals are indicative where a portfolio
        spans currencies; each row is shown in its own currency.
      </p>

      {rows.length === 0 ? (
        <div className="lx-card p-6 text-center text-sm text-stone">Nothing overdue — every tenancy is up to date.</div>
      ) : (
        <div className="lx-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full lx-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Tenancy</th>
                  <th className="text-right">0–30</th>
                  <th className="text-right">31–60</th>
                  <th className="text-right">61–90</th>
                  <th className="text-right">90+</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Oldest</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lease_id || r.tenant}>
                    <td>
                      <div className="font-medium text-ink">{r.tenant}</div>
                      <div className="text-xs text-stone">{r.unit}{r.property ? ` · ${r.property}` : ''}</div>
                    </td>
                    <td className="text-right">{r.d0_30 ? money(r.d0_30) : '—'}</td>
                    <td className="text-right">{r.d31_60 ? money(r.d31_60) : '—'}</td>
                    <td className="text-right">{r.d61_90 ? money(r.d61_90) : '—'}</td>
                    <td className={`text-right ${r.d90_plus ? 'text-rose-600 font-medium' : ''}`}>{r.d90_plus ? money(r.d90_plus) : '—'}</td>
                    <td className="text-right font-semibold text-ink">{money(r.total)}</td>
                    <td className="text-right text-xs text-stone">{r.oldest_days}d</td>
                    {canEdit && (
                      <td className="text-right">
                        {feeFor === (r.lease_id || r.tenant) ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input type="number" autoFocus value={feeAmt} onChange={(e) => setFeeAmt(e.target.value)}
                              placeholder="Fee" className="lx-input w-20 text-sm py-1" />
                            <button disabled={busy || feeAmt === ''} onClick={() => chargeFee(r)} className="lx-btn-primary text-xs px-2.5 py-1">Add</button>
                            <button onClick={() => { setFeeFor(null); setFeeAmt(''); }} className="text-xs text-stone px-1">✕</button>
                          </span>
                        ) : (
                          r.lease_id && (
                            <button onClick={() => { setFeeFor(r.lease_id || r.tenant); setFeeAmt(''); }} className="text-xs text-stone hover:text-gold">+ Late fee</button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="font-medium text-ink">All tenancies</td>
                  <td className="text-right">{money(t.d0_30)}</td>
                  <td className="text-right">{money(t.d31_60)}</td>
                  <td className="text-right">{money(t.d61_90)}</td>
                  <td className="text-right text-rose-600">{money(t.d90_plus)}</td>
                  <td className="text-right font-semibold text-ink">{money(t.total)}</td>
                  <td />
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="lx-card p-4">
      <div className="lx-eyebrow mb-1">{label}</div>
      <div className={`font-sans font-bold text-lg ${tone === 'bad' ? 'text-rose-600' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
