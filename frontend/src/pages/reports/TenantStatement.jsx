import { useEffect, useState } from 'react';
import { getTenants, getTenantStatement, readApiError } from '../../api/client.js';
import { formatMoney } from '../../utils/currency.js';
import { downloadCsv } from '../../utils/csv.js';

// A full ledger for one tenant, laid out to be printed or saved as PDF
// via the browser and handed to the tenant or an accountant.
export default function TenantStatement() {
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState('');
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getTenants()
      .then(setTenants)
      .catch((err) => setError(readApiError(err, 'load tenants')));
  }, []);

  useEffect(() => {
    if (!selected) return setStatement(null);
    getTenantStatement(selected)
      .then(setStatement)
      .catch((err) => setError(readApiError(err, 'load that statement')));
  }, [selected]);

  const currency = statement?.lines?.[0]?.currency || 'GHS';
  const m = (v) => formatMoney(v, currency);

  return (
    <div>
      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5 print:hidden">
        <div className="flex-1">
          <label className="block text-xs text-stone mb-1">Tenant</label>
          <select className="lx-select w-full sm:max-w-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.lintel_id} — {t.first_name} {t.last_name}
              </option>
            ))}
          </select>
        </div>
        {statement && (
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="lx-btn-ghost text-xs">Print / save as PDF</button>
            <button
              onClick={() =>
                downloadCsv(
                  `statement-${statement.tenant.lintel_id}.csv`,
                  ['Due date', 'Paid date', 'Description', 'Amount', 'Currency', 'Status', 'Method', 'Reference'],
                  statement.lines.map((l) => [
                    l.due_date || '', l.payment_date || '', l.description,
                    l.amount, l.currency, l.status, l.method || '', l.reference || '',
                  ])
                )
              }
              className="lx-btn-ghost text-xs"
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      {!statement ? (
        <p className="text-stone text-sm">Choose a tenant to produce their statement.</p>
      ) : (
        <div className="lx-card p-6 sm:p-8">
          {/* Header — who it's from and who it's for */}
          <div className="flex justify-between gap-6 flex-wrap mb-6 pb-6 border-b border-line">
            <div>
              <div className="font-serif text-xl text-ink">{statement.company?.name || 'Statement'}</div>
              <div className="text-xs text-stone mt-1 leading-relaxed">
                {[statement.company?.address, statement.company?.city, statement.company?.country]
                  .filter(Boolean).join(', ')}
                {statement.company?.phone && <><br />{statement.company.phone}</>}
                {statement.company?.email && <><br />{statement.company.email}</>}
              </div>
            </div>
            <div className="text-right">
              <div className="lx-eyebrow mb-1">Statement of account</div>
              <div className="font-medium text-ink">{statement.tenant.name}</div>
              <div className="text-xs text-stone">{statement.tenant.lintel_id}</div>
              <div className="text-xs text-stone mt-1">
                {[statement.tenant.email, statement.tenant.phone].filter(Boolean).join(' · ')}
              </div>
              <div className="text-[11px] text-stone-light mt-2">
                Generated {new Date(statement.generated_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Leases this covers */}
          {statement.leases.length > 0 && (
            <div className="mb-6">
              <div className="lx-eyebrow mb-2">Tenancies</div>
              <ul className="text-sm space-y-1">
                {statement.leases.map((l, i) => (
                  <li key={i} className="flex justify-between gap-4 border-b border-line/60 pb-1.5">
                    <span>{l.unit} — {l.property}</span>
                    <span className="text-stone text-xs">
                      {l.start_date} → {l.end_date || 'ongoing'} · {m(l.rate)}/{l.rate_period} · {l.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ledger */}
          <div className="lx-eyebrow mb-2">Transactions</div>
          <div className="overflow-x-auto">
            <table className="w-full lx-table min-w-[620px]">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Paid</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-xs">{l.due_date || '—'}</td>
                    <td className="text-xs">{l.payment_date || '—'}</td>
                    <td className="text-xs">{l.description}</td>
                    <td className="text-xs capitalize">{l.status}</td>
                    <td className="text-right">{formatMoney(l.amount, l.currency)}</td>
                  </tr>
                ))}
                {statement.lines.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-stone">No transactions recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-5">
            <dl className="text-sm w-full sm:w-64 space-y-1.5">
              <Row label="Total charged" value={m(statement.totals.charged)} />
              <Row label="Total paid" value={m(statement.totals.paid)} />
              <div className="flex justify-between pt-2 border-t border-line font-medium">
                <dt>Outstanding</dt>
                <dd className={statement.totals.outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  {m(statement.totals.outstanding)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-stone">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
