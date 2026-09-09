import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnitsPerformance, getUpgradeEligible, getTenants, getUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { IconUsers, IconSparkle, IconArrowRight, IconWallet, IconWrench } from '../components/icons.jsx';

export default function Dashboard() {
  const { money } = useSettings();
  const { user, company } = useAuth();
  const [performance, setPerformance] = useState([]);
  const [units, setUnits] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const topTenants = useMemo(() => [...tenants].sort((a, b) => b.score - a.score).slice(0, 3), [tenants]);
  const topTenant = topTenants[0];
  const worstFirst = useMemo(() => [...performance].sort((a, b) => a.net_yield - b.net_yield), [performance]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const riskRatio = units.length ? totalOpenFaults / units.length : 0;
  const riskLabel = riskRatio < 0.34 ? 'Low risk' : riskRatio < 0.7 ? 'Medium risk' : 'High risk';
  const riskColor = riskRatio < 0.34 ? 'text-emerald-600 bg-emerald-50' : riskRatio < 0.7 ? 'text-amber-600 bg-amber-50' : 'text-rose-600 bg-rose-50';
  const hasData = units.length > 0;

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && (
        <div className="lx-card border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 mb-6 text-sm">
          Couldn&apos;t reach the API ({error}). Confirm the backend is running and <code>VITE_API_URL</code> is set.
        </div>
      )}

      {/* ---------- Reception hero — the image is the star, text sits on
           localized darkening top and bottom so the middle of the photo stays
           clear. Glass KPI cards float along the bottom edge. ---------- */}
      <section className="relative rounded-3xl overflow-hidden mb-6 shadow-lift bg-ink min-h-[380px] sm:min-h-[480px]">
        <img
          src="/app1.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[center_55%]"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,19,19,0.62) 0%, rgba(19,19,19,0.14) 26%, rgba(19,19,19,0.10) 52%, rgba(19,19,19,0.55) 82%, rgba(19,19,19,0.86) 100%)',
          }}
        />

        <div className="relative z-10 min-h-[380px] sm:min-h-[480px] flex flex-col justify-between p-6 sm:p-9">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold-light mb-2">
              {dateStr}
              {company?.name ? <span className="text-white/50"> · {company.name}</span> : null}
            </div>
            <h2 className="font-serif text-[28px] sm:text-[38px] leading-tight text-white">
              {greeting}, {firstName}.
            </h2>
            {hasData ? (
              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap mt-3">
                <span className="font-serif text-white text-[34px] sm:text-[42px] leading-none">{money(totalRevenue)}</span>
                <span className="text-white/70 text-sm">collected · net {money(netYield)} after costs</span>
              </div>
            ) : (
              <p className="text-white/75 text-sm mt-4 max-w-md">
                Add your first property and unit to bring your dashboard to life.
              </p>
            )}
          </div>

          {hasData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <GlassStat label="Occupancy" value={`${avgOccupancy}%`} />
              <GlassStat label="Revenue collected" value={money(totalRevenue)} />
              <GlassStat label="Net income" value={money(netYield)} />
              <GlassStat label="Open faults" value={totalOpenFaults} />
            </div>
          )}
        </div>
      </section>

      {hasData && (
        <>
          {/* ---------- Insight cards ---------- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lx-card p-5">
              <div className="lx-eyebrow mb-3">Revenue vs costs</div>
              <BarRow icon={IconWallet} label="Revenue" value={totalRevenue} max={Math.max(totalRevenue, totalCosts, 1)} color="bg-emerald-500" />
              <BarRow label="Costs" value={totalCosts} max={Math.max(totalRevenue, totalCosts, 1)} color="bg-rose-400" />
              <div className="text-sm font-semibold text-ink mt-3 pt-3 border-t border-line/70">Net {money(netYield)}</div>
            </div>

            <div className="lx-card p-5">
              <div className="lx-eyebrow mb-3">Portfolio risk</div>
              <span className={`pill ${riskColor} mb-3`}>{riskLabel}</span>
              <div className="text-sm text-stone">
                {totalOpenFaults} open fault{totalOpenFaults === 1 ? '' : 's'} across {units.length} unit{units.length === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <IconWrench width={14} height={14} className="text-stone" />
                <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                  <div
                    className={`h-full rounded-full ${riskRatio < 0.34 ? 'bg-emerald-500' : riskRatio < 0.7 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, Math.max(6, riskRatio * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="lx-card p-5">
              <div className="lx-eyebrow mb-3">Top tenants</div>
              {topTenants.length ? (
                <ul className="space-y-2.5">
                  {topTenants.map((t) => (
                    <li key={t.id}>
                      <Link to={`/tenants/${t.id}`} className="flex items-center gap-3 group">
                        <span className="w-9 h-9 rounded-full bg-panel border border-line flex items-center justify-center text-xs font-semibold text-ink shrink-0">
                          {t.first_name[0]}{t.last_name[0]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink group-hover:text-gold transition truncate">
                            {t.first_name} {t.last_name}
                          </div>
                          <div className="text-xs text-stone">{t.lintel_id}</div>
                        </div>
                        <span className="text-xs text-stone shrink-0">score {t.score}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone">No tenants yet.</p>
              )}
            </div>
          </div>

          {/* ---------- Upgrade opportunities ---------- */}
          {eligible.length > 0 && (
            <div className="lx-card p-5 sm:p-6 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <IconSparkle width={14} height={14} className="text-gold" />
                <span className="lx-eyebrow text-gold">Upgrade opportunities</span>
              </div>
              <p className="text-sm text-stone mb-4">
                These tenants qualify for an Exclusive-tier offer based on tenure and payment history.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {eligible.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm bg-panel/60 rounded-xl px-4 py-3">
                    <Link to={`/tenants/${t.id}`} className="font-medium text-ink hover:text-gold transition flex items-center gap-2 min-w-0">
                      <IconUsers width={14} height={14} className="text-stone shrink-0" />
                      <span className="truncate">{t.first_name} {t.last_name}</span>
                    </Link>
                    <span className="text-stone text-xs shrink-0">score {t.score} · {t.total_stays} stays</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---------- Unit performance ---------- */}
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h3 className="font-serif text-lg text-ink">Unit performance</h3>
            <span className="text-xs text-stone hidden sm:inline">sorted worst → best net yield</span>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {worstFirst.map((p) => (
              <div key={p.unit_id} className="lx-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/units/${p.unit_id}`} className="min-w-0 group">
                    <div className="font-medium text-ink group-hover:text-gold transition truncate">{p.unit_code}</div>
                    <div className="text-xs text-stone truncate">{p.property_name}</div>
                  </Link>
                  <span className="pill bg-stone/10 text-stone capitalize shrink-0">{p.class}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><div className="text-[10px] uppercase tracking-wide text-stone">Revenue</div><div className="text-sm text-ink font-medium">{money(p.revenue)}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-stone">Costs</div><div className="text-sm text-ink font-medium">{money(p.total_costs)}</div></div>
                  <div><div className="text-[10px] uppercase tracking-wide text-stone">Net yield</div><div className={`text-sm font-medium ${p.net_yield < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(p.net_yield)}</div></div>
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
          </div>

          {/* Desktop table */}
          <div className="lx-card overflow-hidden hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full lx-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Unit</th><th>Class</th>
                    <th className="text-right">Revenue</th><th className="text-right">Costs</th><th className="text-right">Net yield</th>
                    <th>Occupancy</th><th className="text-right">Open faults</th><th />
                  </tr>
                </thead>
                <tbody>
                  {worstFirst.map((p) => (
                    <tr key={p.unit_id}>
                      <td><div className="font-medium text-ink">{p.unit_code}</div><div className="text-xs text-stone">{p.property_name}</div></td>
                      <td className="capitalize">{p.class}</td>
                      <td className="text-right">{money(p.revenue)}</td>
                      <td className="text-right">{money(p.total_costs)}</td>
                      <td className={`text-right font-medium ${p.net_yield < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(p.net_yield)}</td>
                      <td>
                        <div className="flex items-center gap-2 w-28">
                          <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
                            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, p.occupancy_rate)}%` }} />
                          </div>
                          <span className="text-xs text-stone w-9 text-right">{p.occupancy_rate}%</span>
                        </div>
                      </td>
                      <td className="text-right">{p.open_faults > 0 ? <StatusBadge status="open" /> : <span className="text-stone text-xs">&mdash;</span>}</td>
                      <td className="text-right">
                        <Link to={`/units/${p.unit_id}`} className="text-stone hover:text-gold transition inline-flex"><IconArrowRight width={16} height={16} /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Frosted KPI card that floats over the reception photo.
function GlassStat({ label, value }) {
  return (
    <div className="bg-white/12 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-3.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/60 mb-1.5">{label}</div>
      <div className="font-serif text-white text-lg sm:text-2xl leading-none num">{value}</div>
    </div>
  );
}

function BarRow({ icon: Icon, label, value, max, color }) {
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
