import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnitsPerformance, getUpgradeEligible, getTenants, getUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { IconBuilding, IconUsers, IconSparkle, IconArrowRight, IconWallet, IconWrench } from '../components/icons.jsx';

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'performance', label: 'Unit Performance' },
  { id: 'upgrades', label: 'Upgrade Opportunities' },
];

export default function Dashboard() {
  const { money } = useSettings();
  const { user } = useAuth();
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

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

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

      {/* Hero — a reception/lobby backdrop with the greeting and live figures
          over a dark ink scrim (kept dark on the left so the text stays legible
          whatever the photo). The image lives in /public. */}
      <div className="relative rounded-3xl overflow-hidden min-h-[300px] sm:min-h-[380px] mb-6 shadow-lift bg-ink">
        <img
          src="/app1.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[center_60%]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(96deg, rgba(19,19,19,.95) 0%, rgba(19,19,19,.74) 40%, rgba(19,19,19,.34) 72%, rgba(19,19,19,.10) 100%)',
          }}
        />

        <div className="relative z-10 min-h-[300px] sm:min-h-[380px] flex flex-col justify-between p-6 sm:p-9">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-light mb-2">{dateStr}</div>
            <h2 className="font-serif text-[26px] sm:text-[34px] leading-tight text-white">
              {greeting}, {firstName}.
            </h2>
            {units.length > 0 ? (
              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap mt-4">
                <span className="font-serif text-white text-[36px] sm:text-[44px] leading-none">{money(totalRevenue)}</span>
                <span className="text-white/70 text-sm">collected · net {money(netYield)} after costs</span>
              </div>
            ) : (
              <p className="text-white/70 text-sm mt-4 max-w-md">
                Add your first property and unit to bring your dashboard to life.
              </p>
            )}
          </div>

          {units.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              <HeroChip label="Occupancy" value={`${avgOccupancy}%`} />
              <HeroChip label="Units" value={units.length} />
              <HeroChip label="Tenants" value={tenants.length} />
              <HeroChip label="Open faults" value={totalOpenFaults} />
            </div>
          )}
        </div>
      </div>

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
        <>
        {/* Mobile: stacked cards instead of a sideways-scrolling table */}
        <div className="sm:hidden space-y-3">
          {performance.map((p) => (
            <div key={p.unit_id} className="lx-card p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/units/${p.unit_id}`} className="min-w-0 group">
                  <div className="font-medium text-ink group-hover:text-gold transition truncate">{p.unit_code}</div>
                  <div className="text-xs text-stone truncate">{p.property_name}</div>
                </Link>
                <span className="pill bg-stone/10 text-stone capitalize shrink-0">{p.class}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone">Revenue</div>
                  <div className="text-sm text-ink font-medium">{money(p.revenue)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone">Costs</div>
                  <div className="text-sm text-ink font-medium">{money(p.total_costs)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone">Net yield</div>
                  <div className={`text-sm font-medium ${p.net_yield < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(p.net_yield)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line/70">
                <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, p.occupancy_rate)}%` }} />
                </div>
                <span className="text-xs text-stone w-9 text-right">{p.occupancy_rate}%</span>
                {p.open_faults > 0 ? <StatusBadge status="open" /> : <span className="text-stone text-xs">&mdash;</span>}
              </div>
            </div>
          ))}
          {performance.length === 0 && (
            <div className="lx-card p-8 text-center text-stone text-sm">No units yet.</div>
          )}
        </div>

        {/* Tablet + desktop: full table */}
        <div className="lx-card overflow-hidden hidden sm:block">
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
        </>
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
