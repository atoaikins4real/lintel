import { useEffect, useState } from 'react';
import { getPropertyPnl, readApiError } from '../../api/client.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { downloadCsv } from '../../utils/csv.js';

// Profit and loss per building. Revenue counts PAID payments only —
// pending and late amounts are owed, not earned, and including them would
// flatter the numbers.
export default function PropertyPnl() {
  const { money } = useSettings();
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [error, setError] = useState('');

  const load = () =>
    getPropertyPnl({ from: range.from || undefined, to: range.to || undefined })
      .then(setData)
      .catch((err) => setError(readApiError(err, 'load the P&L')));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  if (error) {
    return <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>;
  }
  if (!data) return <p className="text-stone text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5">
        <div>
          <label className="block text-xs text-stone mb-1">From</label>
          <input type="date" className="lx-input" value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-stone mb-1">To</label>
          <input type="date" className="lx-input" value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </div>
        {(range.from || range.to) && (
          <button onClick={() => setRange({ from: '', to: '' })} className="lx-btn-ghost text-xs">
            Clear — show all time
          </button>
        )}
        <div className="sm:ml-auto">
          <button
            onClick={() =>
              downloadCsv(
                `property-pnl${range.from ? `-${range.from}` : ''}${range.to ? `-to-${range.to}` : ''}.csv`,
                ['Property', 'City', 'Units', 'Occupied', 'Revenue', 'Expenses', 'Renovations', 'Fault costs', 'Total costs', 'Net', 'Margin %'],
                data.rows.map((r) => [
                  r.property_name, r.city || '', r.units, r.occupied,
                  r.revenue, r.expenses, r.renovations, r.fault_costs, r.costs, r.net,
                  r.margin_pct ?? '',
                ])
              )
            }
            className="lx-btn-ghost text-xs"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Revenue" value={money(data.totals.revenue)} />
        <Stat label="Costs" value={money(data.totals.costs)} />
        <Stat label="Net" value={money(data.totals.net)} tone={data.totals.net >= 0 ? 'good' : 'bad'} />
        <Stat
          label="Margin"
          value={data.totals.revenue > 0
            ? `${Math.round((data.totals.net / data.totals.revenue) * 1000) / 10}%`
            : '—'}
        />
      </div>

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[820px]">
            <thead>
              <tr>
                <th>Property</th>
                <th className="text-right">Units</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Expenses</th>
                <th className="text-right">Renovations</th>
                <th className="text-right">Faults</th>
                <th className="text-right">Net</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.property_id || 'unassigned'}>
                  <td>
                    <div className="font-medium text-ink">{r.property_name}</div>
                    {r.city && <div className="text-xs text-stone">{r.city}</div>}
                  </td>
                  <td className="text-right">{r.occupied}/{r.units}</td>
                  <td className="text-right">{money(r.revenue)}</td>
                  <td className="text-right">{money(r.expenses)}</td>
                  <td className="text-right">{money(r.renovations)}</td>
                  <td className="text-right">{money(r.fault_costs)}</td>
                  <td className={`text-right font-medium ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {money(r.net)}
                  </td>
                  <td className="text-right">{r.margin_pct === null ? '—' : `${r.margin_pct}%`}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-stone">No properties yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-stone mt-3">
        Revenue counts payments marked <strong>paid</strong> only. Amounts still pending or late are owed rather
        than earned, so they aren&apos;t included here — see the Rent roll for those.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const colour = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-ink';
  return (
    <div className="lx-card p-4">
      <div className="lx-eyebrow mb-1">{label}</div>
      <div className={`font-sans font-bold text-lg ${colour}`}>{value}</div>
    </div>
  );
}
