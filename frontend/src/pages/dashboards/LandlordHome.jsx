import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnitsPerformance, getUpgradeEligible, getTenants, getUnits } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { IconUsers, IconSparkle, IconArrowRight, IconWallet, IconWrench, IconBuilding, IconHome } from '../../components/icons.jsx';

export default function LandlordHome() {
  const { money } = useSettings();
  const { user, company } = useAuth();
  const [performance, setPerformance] = useState([]);
  const [units, setUnits] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [featIdx, setFeatIdx] = useState(0);

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

  // Homes to feature in the hero carousel — prefer ones with a photo.
  const featured = useMemo(() => {
    const withPhoto = units.filter((u) => u.photo_url);
    return (withPhoto.length ? withPhoto : units).slice(0, 6);
  }, [units]);
  const feat = featured.length ? featured[featIdx % featured.length] : null;
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && (
        <div className="lx-card border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 mb-6 text-sm">
          Couldn&apos;t reach the API ({error}). Confirm the backend is running and <code>VITE_API_URL</code> is set.
        </div>
      )}

      {/* ---------- Hero — architecture-studio style over the brand photo,
           personalized with the subscriber's own numbers. Theme-independent
           (explicit colours) so it keeps the warm look in light and dark. ---------- */}
      <section className="relative rounded-[28px] overflow-hidden mb-6 shadow-lift bg-ink min-h-[600px]">
        <img
          src="/bg1.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = '/app1.jpg'; } }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(20,16,12,0.55) 0%, rgba(20,16,12,0.10) 24%, rgba(20,16,12,0.08) 46%, rgba(20,16,12,0.52) 76%, rgba(20,16,12,0.85) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-col justify-between gap-8 min-h-[600px] p-6 sm:p-9 md:p-10">
          {/* Top: headline + CTAs, with portfolio facts stacked on the right */}
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-3">
                Homes <span className="text-white/40">—</span> Residents <span className="text-white/40">—</span> Rent
              </div>
              <h1 className="font-serif text-white leading-[1.04] text-[36px] sm:text-[52px] md:text-[60px]">
                {greeting},<br /><span className="text-gold-light">{firstName}.</span>
              </h1>
              <p className="text-white/80 text-sm sm:text-base mt-4 max-w-md">
                {hasData
                  ? `${money(totalRevenue)} collected · net ${money(netYield)} after costs across ${units.length} ${units.length === 1 ? 'home' : 'homes'}.`
                  : 'Add your first building and apartment to bring your home screen to life.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-6">
                <Link to="/units/onboard"
                  className="inline-flex items-center gap-2 rounded-full bg-white text-ink px-5 py-3 text-sm font-medium hover:bg-white/90 transition shadow-soft">
                  Add a home <IconArrowRight width={16} height={16} />
                </Link>
                <a href={publicHref} target={company?.slug ? '_blank' : undefined} rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-white text-sm font-medium group">
                  <span className="w-10 h-10 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
                    <IconArrowRight width={16} height={16} />
                  </span>
                  View your public page
                </a>
              </div>
            </div>

            {hasData && (
              <div className="hidden lg:flex flex-col items-end gap-3 text-right shrink-0">
                {[['Occupancy', `${avgOccupancy}%`], ['Apartments', units.length], ['Residents', tenants.length], ['Collected', money(totalRevenue)]].map(([l, v]) => (
                  <div key={l}>
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/50">{l}</div>
                    <div className="text-white font-serif text-base leading-none mt-1">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom: featured home · stats · share CTA */}
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.25fr_1fr] gap-3 md:gap-4">
            <div className="rounded-2xl bg-white/90 backdrop-blur-md p-3.5 flex flex-col gap-3 text-[#1b1b1b]">
              {feat ? (
                <>
                  <Link to={`/units/${feat.id}`} className="flex items-center gap-3 group">
                    {feat.photo_url
                      ? <img src={feat.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                      : <span className="w-14 h-14 rounded-xl bg-neutral-200 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-gold">Featured home</span>
                      <span className="block font-medium truncate group-hover:text-gold transition">{feat.unit_code}</span>
                      <span className="block text-xs text-neutral-500 truncate">{feat.property_name}{feat.city ? ` · ${feat.city}` : ''}</span>
                    </span>
                  </Link>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      {String((featIdx % featured.length) + 1).padStart(2, '0')} / {String(featured.length).padStart(2, '0')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" aria-label="Previous" onClick={() => setFeatIdx((i) => (i - 1 + featured.length) % featured.length)}
                        className="w-7 h-7 rounded-full border border-neutral-300 flex items-center justify-center hover:bg-neutral-100 leading-none">‹</button>
                      <button type="button" aria-label="Next" onClick={() => setFeatIdx((i) => (i + 1) % featured.length)}
                        className="w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center leading-none">›</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-500 py-4 text-center">No homes to feature yet.</div>
              )}
            </div>

            <div className="rounded-2xl bg-white/90 backdrop-blur-md p-4 grid grid-cols-3 gap-2 text-[#1b1b1b]">
              {[[units.length, 'Apartments', IconBuilding], [tenants.length, 'Residents', IconUsers], [`${avgOccupancy}%`, 'Occupancy', IconHome]].map(([v, l, Ic]) => (
                <div key={l} className="flex flex-col items-center justify-center text-center">
                  <Ic width={18} height={18} className="text-gold mb-1.5" />
                  <div className="font-serif text-xl leading-none">{v}</div>
                  <div className="text-[10px] text-neutral-500 mt-1">{l}</div>
                </div>
              ))}
            </div>

            <a href={publicHref} target={company?.slug ? '_blank' : undefined} rel="noopener noreferrer"
              className="rounded-2xl bg-ink/88 backdrop-blur text-white p-4 flex items-center justify-between gap-3 group">
              <span className="min-w-0">
                <span className="block font-serif text-lg leading-tight">Share your homes</span>
                <span className="block text-white/60 text-xs mt-1">{company?.slug ? 'Send your public page to renters' : 'Set up your public link'}</span>
              </span>
              <span className="w-10 h-10 rounded-full bg-white text-ink flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <IconArrowRight width={16} height={16} />
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Quick actions — big, plain-language shortcuts so anyone
           knows what to do next, even on day one. ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <QuickAction to="/units/onboard" icon={IconBuilding} title="Add an apartment" sub="List a home" />
        <QuickAction to="/tenants/onboard" icon={IconUsers} title="Add a resident" sub="Someone new renting" />
        <QuickAction to="/payments" icon={IconWallet} title="Record a payment" sub="Rent received" />
        <QuickAction
          to={company?.slug ? `/showcase/${company.slug}` : '/settings'}
          external={Boolean(company?.slug)}
          icon={IconHome} title="View your public page" sub={company?.slug ? 'What renters see' : 'Set up your link'} />
      </div>

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
                {totalOpenFaults} open repair{totalOpenFaults === 1 ? '' : 's'} across {units.length} apartment{units.length === 1 ? '' : 's'}
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
              <div className="lx-eyebrow mb-3">Top residents</div>
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
                <p className="text-sm text-stone">No residents yet.</p>
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
                These residents qualify for an Exclusive-tier offer based on how long they’ve stayed and their payment history.
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
            <h3 className="font-serif text-lg text-ink">How your homes are doing</h3>
            <span className="text-xs text-stone hidden sm:inline">needs attention first</span>
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
                    <th>Home</th><th>Class</th>
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

// Big, friendly shortcut tile for the home screen.
function QuickAction({ to, icon: Icon, title, sub, external }) {
  const inner = (
    <>
      <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0">
        <Icon width={18} height={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink truncate">{title}</span>
        <span className="block text-xs text-stone truncate">{sub}</span>
      </span>
    </>
  );
  const cls = 'lx-card lx-lift p-4 flex items-center gap-3';
  return external
    ? <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
    : <Link to={to} className={cls}>{inner}</Link>;
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
