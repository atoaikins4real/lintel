import { useEffect, useState } from 'react';
import { getRentRoll, readApiError } from '../../api/client.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { downloadCsv } from '../../utils/csv.js';

// Every active lease, what it's contracted at, and what's outstanding.
// Sorted worst-first so overdue money surfaces immediately.
export default function RentRoll() {
  const { money } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getRentRoll()
      .then(setData)
      .catch((err) => setError(readApiError(err, 'load the rent roll')));
  }, []);

  if (error) {
    return <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>;
  }
  if (!data) return <p className="text-stone text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
          <Stat label="Active leases" value={data.active_leases} />
          <Stat label="Outstanding" value={money(data.totals.outstanding)} />
          <Stat label="Overdue" value={money(data.totals.overdue)} tone={data.totals.overdue > 0 ? 'bad' : null} />
        </div>
        <button
          onClick={() =>
            downloadCsv(
              'rent-roll.csv',
              ['Tenant', 'Lintel ID', 'Contact', 'Property', 'Unit', 'Type', 'Rate', 'Period', 'Start', 'End', 'Outstanding', 'Overdue'],
              data.rows.map((r) => [
                r.tenant, r.lintel_id || '', r.contact || '', r.property, r.unit,
                r.stay_type, r.rate, r.rate_period, r.start_date, r.end_date || '',
                r.outstanding, r.overdue,
              ])
            )
          }
          className="lx-btn-ghost text-xs"
        >
          Export CSV
        </button>
      </div>

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[860px]">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Term</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.lease_id}>
                  <td>
                    <div className="font-medium text-ink">{r.tenant}</div>
                    <div className="text-xs text-stone">{r.lintel_id}{r.contact ? ` · ${r.contact}` : ''}</div>
                  </td>
                  <td>
                    <div>{r.unit}</div>
                    <div className="text-xs text-stone">{r.property}</div>
                  </td>
                  <td className="text-xs">
                    {r.start_date} → {r.end_date || 'ongoing'}
                    <div className="text-stone capitalize">{r.stay_type.replace('_', ' ')}</div>
                  </td>
                  <td className="text-right">{money(r.rate)}<span className="text-xs text-stone">/{r.rate_period}</span></td>
                  <td className="text-right">{r.outstanding ? money(r.outstanding) : '—'}</td>
                  <td className={`text-right font-medium ${r.overdue > 0 ? 'text-rose-700' : 'text-stone'}`}>
                    {r.overdue ? money(r.overdue) : '—'}
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-stone">No active leases.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="lx-card p-4">
      <div className="lx-eyebrow mb-1">{label}</div>
      <div className={`font-sans font-bold text-lg ${tone === 'bad' ? 'text-rose-700' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
