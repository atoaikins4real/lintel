import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnitsPerformance, getUpgradeEligible, getTenants, getUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { IconBuilding, IconUsers, IconSparkle, IconArrowRight, IconWallet, IconWrench } from '../components/icons.jsx';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'performance', label: 'Unit Performance' },
  { id: 'upgrades', label: 'Upgrade Opportunities' },
];

export default function Dashboard() {
  const { money } = useSettings();
  const [performance, setPerformance] = useState([]);
  const [units, setUnits] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('summary');

  useEffect(() => {
    Promise.all([getUnitsPerformance(), getUpgradeEligible(), getTenants(), getUnits()])
      .then(([perf, elig, tenantList, unitList]) => {
        setPerformance(perf);
        setEligible(elig);
        setTenants(tenantList);
        setUnits(unitList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = performance.reduce((s, p) => s + Number(p.revenue), 0);
  const totalCosts = performance.reduce((s, p) => s + Number(p.total_costs), 0);
  const netYield = totalRevenue - totalCosts;
  const totalOpenFaults = performance.reduce((s, p) => s + Number(p.open_faults), 0);
  const avgOccupancy = performance.length
    ? Math.round((performance.reduce((s, p) => s + Number(p.occupancy_rate), 0) / performance.length) * 100) / 100
    : 0;

  const bestPerf = useMemo(
    () => (performance.length ? [...performance].sort((a, b) => b.net_yield - a.net_yield)[0] : null),
    [performance]
  );
  const featureUnit = useMemo(() => {
    if (bestPerf) return units.find((u) => u.id === bestPerf.unit_id) || units[0];
    return units[0];
  }, [bestPerf, units]);

  const topTenants = useMemo(() => [...tenants].sort((a, b) => b.score - a.score).slice(0, 3), [tenants]);
  const topTenant = topTenants[0];

  const riskRatio = units.length ? totalOpenFaults / units.length : 0;
  const riskLabel = riskRatio === 0 ? 'Low risk' : riskRatio < 0.34 ? 'Low risk' : riskRatio < 0.7 ? 'Medium risk' : 'High risk';
  const riskColor = riskRatio === 0 || riskRatio < 0.34 ? 'text-emerald-600 bg-emerald-50' : riskRatio < 0.7 ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && (
        <div className="lx-card border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 mb-6 text-sm">
          Couldn&apos;t reach the API ({error}). Confirm the backend is running and{' '}
          <code>VITE_API_URL</code> is set.
        </div>
      )}

      {/* Hero — feature (best-performing) property */}
      {featureUnit ? (
        <div className="relative rounded-3xl overflow-hidden min-h-[360px] sm:min-h-[440px] mb-6">
          {featureUnit.photo_url ? (
            <img src={featureUnit.photo_url} alt={featureUnit.unit_code} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(135deg, #26241f 0%, #131313 55%, #1c1712 100%)' }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />

          <div className="relative z-10 h-full min-h-[360px] sm:min-h-[440px] flex flex-col justify-between p-5 sm:p-9">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/55 mb-2">
                  {bestPerf ? 'Top performing property' : 'Featured property'}
                </div>
                <h2 className="font-serif text-[26px] sm:text-[38px] leading-tight text-white max-w-lg">
                  {featureUnit.property_name}
                </h2>
                <p className="text-white/65 text-sm mt-1">
                  {featureUnit.unit_code}{featureUnit.city ? ` · ${featureUnit.city}` : ''}
                </p>
              </div>

              <div className="bg-white/95 backdrop-blur rounded-2xl p-4 shadow-lift w-full xs:w-auto sm:w-48">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-7 h-7 rounded-lg bg-panel flex items-center justify-center text-gold shrink-0">
                    <IconSparkle width={13} height={13} />
                  </span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-stone">Portfolio</span>
                </div>
                <div className="text-xl font-sans font-bold text-ink leading-none">{units.length} units</div>
                <div className="text-xs text-stone mt-1">{tenants.length} tenants tracked</div>
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap gap-2.5">
                <HeroChip label="Occupancy" value={`${bestPerf ? bestPerf.occupancy_rate : 0}%`} />
                <HeroChip label="Net Yield" value={money(bestPerf ? bestPerf.net_yield : 0)} />
                <HeroChip label="Open Faults" value={bestPerf ? bestPerf.open_faults : 0} />
                <HeroChip label="Class" value={featureUnit.class} capitalize />
              </div>

              {topTenants.length > 0 && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/25 rounded-full pl-2 pr-3.5 py-1.5">
                  <div className="flex -space-x-2">
                    {topTenants.map((t) => (
                      <span
                        key={t.id}
                        title={`${t.first_name} ${t.last_name}`}
                        className="w-7 h-7 rounded-full bg-gold text-white text-[10px] font-semibold flex items-center justify-center border-2 border-black/20"
                      >
                        {t.first_name[0]}{t.last_name[0]}
                      </span>
                    ))}
                  </div>
                  <span className="text-white text-xs font-medium">Top tenants</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="lx-card p-8 text-center text-stone mb-6">
          No units yet — add one from the Units tab to populate your dashboard.
        </div>
      )}

      {/* Pill tab row */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              tab === t.id ? 'bg-ink text-white' : 'bg-white border border-line text-stone hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lx-card p-5 flex flex-col items-center text-center">
            <div className="lx-eyebrow mb-3 self-start">Occupancy</div>
            <Donut value={avgOccupancy} />
            <div className="text-xs text-stone mt-3">average across {performance.length} unit{performance.length === 1 ? '' : 's'}</div>
          </div>

          <div className="lx-card p-5">
            <div className="lx-eyebrow mb-3">Portfolio Risk</div>
            <span className={`pill ${riskColor} mb-3`}>{riskLabel}</span>
            <div className="text-sm text-stone">{totalOpenFaults} open fault{totalOpenFaults === 1 ? '' : 's'} across {units.length} unit{units.length === 1 ? '' : 's'}</div>
            <div className="flex items-center gap-2 mt-3">
              <IconWrench width={14} height={14} className="text-stone" />
              <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                <div
                  className={`h-full rounded-full ${riskRatio < 0.34 ? 'bg-emerald-500' : riskRatio < 0.7 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, riskRatio * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="lx-card p-5">
            <div className="lx-eyebrow mb-3">Revenue vs Costs</div>
            <BarRow icon={IconWallet} label="Revenue" value={totalRevenue} max={Math.max(totalRevenue, totalCosts, 1)} color="bg-emerald-500" />
            <BarRow label="Costs" value={totalCosts} max={Math.max(totalRevenue, totalCosts, 1)} color="bg-rose-400" />
            <div className="text-sm font-semibold text-ink mt-2">Net {money(netYield)}</div>
          </div>

          <div className="lx-card p-5">
            <div className="lx-eyebrow mb-3">Top Tenant</div>
            {topTenant ? (
              <Link to={`/tenants/${topTenant.id}`} className="flex items-center gap-3 group">
                <span className="w-11 h-11 rounded-full bg-panel border border-line flex items-center justify-center text-sm font-semibold text-ink shrink-0">
                  {topTenant.first_name[0]}{topTenant.last_name[0]}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink group-hover:text-gold transition truncate">
                    {topTenant.first_name} {topTenant.last_name}
                  </div>
                  <div className="text-xs text-stone">{topTenant.lintel_id} &middot; score {topTenant.score}</div>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-stone">No tenants yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'performance' && (
        <div className="lx-card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-line/70 flex items-center justify-between gap-3">
            <span className="font-serif text-lg text-ink">Unit performance</span>
            <span className="text-xs text-stone hidden sm:inline">sorted worst &rarr; best net yield</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full lx-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Class</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Costs</th>
                  <th className="text-right">Net Yield</th>
                  <th>Occupancy</th>
                  <th className="text-right">Open Faults</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {performance.map((p) => (
                  <tr key={p.unit_id}>
                    <td>
                      <div className="font-medium text-ink">{p.unit_code}</div>
                      <div className="text-xs text-stone">{p.property_name}</div>
                    </td>
                    <td className="capitalize">{p.class}</td>
                    <td className="text-right">{money(p.revenue)}</td>
                    <td className="text-right">{money(p.total_costs)}</td>
                    <td className={`text-right font-medium ${p.net_yield < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {money(p.net_yield)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2 w-28">
                        <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, p.occupancy_rate)}%` }} />
                        </div>
                        <span className="text-xs text-stone w-9 text-right">{p.occupancy_rate}%</span>
                      </div>
                    </td>
                    <td className="text-right">
                      {p.open_faults > 0 ? <StatusBadge status="open" /> : <span className="text-stone text-xs">&mdash;</span>}
                    </td>
                    <td className="text-right">
                      <Link to={`/units/${p.unit_id}`} className="text-stone hover:text-gold transition inline-flex">
                        <IconArrowRight width={16} height={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {performance.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-stone">No units yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'upgrades' && (
        <div className="lx-card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <IconSparkle width={14} height={14} className="text-gold" />
            <span className="lx-eyebrow text-gold">Upgrade opportunities</span>
          </div>
          <p className="text-sm text-stone mb-4">
            These tenants qualify for an Exclusive-tier offer based on tenure and payment history.
          </p>
          {eligible.length > 0 ? (
            <ul className="space-y-2">
              {eligible.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm bg-panel/60 rounded-xl px-4 py-3"
                >
                  <Link to={`/tenants/${t.id}`} className="font-medium text-ink hover:text-gold transition flex items-center gap-2">
                    <IconUsers width={14} height={14} className="text-stone" />
                    {t.lintel_id} &mdash; {t.first_name} {t.last_name}
                  </Link>
                  <span className="text-stone text-xs">score {t.score} &middot; {t.total_stays} stays</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone">No tenants currently qualify.</p>
          )}
        </div>
      )}
    </div>
  );
}

function HeroChip({ label, value, capitalize }) {
  return (
    <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-xl px-3.5 py-2.5">
      <div className="text-[9.5px] uppercase tracking-[0.12em] text-white/55 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-white ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function Donut({ value }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, value) / 100) * c;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112">
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--color-line)" strokeWidth="10" />
      <circle
        cx="56" cy="56" r={r} fill="none" stroke="var(--color-gold)" strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 56 56)"
      />
      <text x="56" y="61" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--color-ink)" fontFamily="Inter, sans-serif">
        {value}%
      </text>
    </svg>
  );
}

function BarRow({ icon: Icon, label, value, max, color }) {
  // Its own hook call — this component sits outside Dashboard(), so it
  // can't close over Dashboard's `money`.
  const { money } = useSettings();
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between text-xs text-stone mb-1">
        <span className="flex items-center gap-1.5">{Icon && <Icon width={12} height={12} />}{label}</span>
        <span className="text-ink font-medium">{money(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
