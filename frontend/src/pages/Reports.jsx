import { useEffect, useState } from 'react';
import { getMonthlyReport, getExpenseBreakdown, getReportsSummary } from '../api/client.js';
import StatCard from '../components/StatCard.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { IconWallet, IconTrendUp, IconTrendDown, IconChart } from '../components/icons.jsx';
import { downloadCsv } from '../utils/csv.js';

const MONTH_LABEL = (key) => {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

const CATEGORY_LABEL = (c) => c.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());

export default function Reports() {
  const { money } = useSettings();
  const [monthly, setMonthly] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [summary, setSummary] = useState(null);
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getMonthlyReport({ months }), getExpenseBreakdown({ months }), getReportsSummary()])
      .then(([m, b, s]) => {
        setMonthly(m);
        setBreakdown(b);
        setSummary(s);
      })
      .finally(() => setLoading(false));
  }, [months]);

  const maxVal = Math.max(1, ...monthly.map((m) => Math.max(m.revenue, m.costs)));
  const maxCategory = Math.max(1, ...breakdown.map((b) => b.amount));

  if (loading && !summary) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Portfolio-wide revenue, costs, and where the money goes.</p>
        <div className="flex items-center gap-2">
          <select className="lx-select !py-2 text-sm" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
          <button
            onClick={() =>
              downloadCsv(
                `lintel-monthly-report-${months}mo.csv`,
                monthly.map((m) => ({ month: m.month, revenue: m.revenue, expenses: m.expenses, renovations: m.renovations, costs: m.costs, net: m.net }))
              )
            }
            className="lx-btn-ghost !px-3 !py-2 text-xs whitespace-nowrap"
          >
            Export CSV
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="All-time revenue" value={money(summary.revenue)} icon={IconTrendUp} />
          <StatCard label="All-time costs" value={money(summary.costs)} icon={IconTrendDown} />
          <StatCard label="Net" value={money(summary.net)} icon={IconWallet} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lx-card p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <IconChart width={14} height={14} className="text-gold" />
            <span className="lx-eyebrow">Revenue vs costs</span>
          </div>
          <p className="text-xs text-stone mb-5">Paid payments vs. expenses + renovations, by month.</p>

          {monthly.length === 0 ? (
            <p className="text-sm text-stone">No payment or expense history yet.</p>
          ) : (
            <div className="flex items-end gap-3 sm:gap-4 h-48 overflow-x-auto pb-1">
              {monthly.map((m) => (
                <div key={m.month} className="flex flex-col items-center gap-1.5 shrink-0" style={{ width: 40 }}>
                  <div className="flex items-end gap-1 h-36">
                    <div
                      className="w-3.5 rounded-t bg-emerald-500"
                      style={{ height: `${Math.max(2, (m.revenue / maxVal) * 100)}%` }}
                      title={`Revenue: ${money(m.revenue)}`}
                    />
                    <div
                      className="w-3.5 rounded-t bg-rose-400"
                      style={{ height: `${Math.max(2, (m.costs / maxVal) * 100)}%` }}
                      title={`Costs: ${money(m.costs)}`}
                    />
                  </div>
                  <span className="text-[10px] text-stone whitespace-nowrap">{MONTH_LABEL(m.month)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-line/70 text-xs text-stone">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Costs</span>
          </div>
        </div>

        <div className="lx-card p-5 sm:p-6">
          <div className="lx-eyebrow mb-1">Expense breakdown</div>
          <p className="text-xs text-stone mb-4">By category, same window.</p>
          {breakdown.length === 0 ? (
            <p className="text-sm text-stone">No expenses logged yet.</p>
          ) : (
            <div className="space-y-3">
              {breakdown.map((b) => (
                <div key={b.category}>
                  <div className="flex items-center justify-between text-xs text-stone mb-1">
                    <span>{CATEGORY_LABEL(b.category)}</span>
                    <span className="text-ink font-medium">{money(b.amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${(b.amount / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lx-card overflow-hidden mt-4 sm:mt-6">
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-line/70 flex items-center justify-between">
          <span className="font-serif text-lg text-ink">Monthly detail</span>
          <span className="text-xs text-stone hidden sm:inline">{months} month window</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[560px]">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Expenses</th>
                <th className="text-right">Renovations</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td>{MONTH_LABEL(m.month)}</td>
                  <td className="text-right">{money(m.revenue)}</td>
                  <td className="text-right">{money(m.expenses)}</td>
                  <td className="text-right">{money(m.renovations)}</td>
                  <td className={`text-right font-medium ${m.net < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {money(m.net)}
                  </td>
                </tr>
              ))}
              {monthly.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-stone">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
