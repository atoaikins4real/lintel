import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnits, getBookingInquiries, getTenants, readApiError } from '../../api/client.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import GettingStarted from '../../components/GettingStarted.jsx';
import AppLauncher from '../../components/AppLauncher.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { IconBuilding, IconUsers, IconHome, IconCalendar, IconArrowRight, IconSparkle } from '../../components/icons.jsx';

// The estate agent's home is a sales desk: how many listings are live, which
// buyer enquiries are waiting, and the contacts behind them. Listings are units,
// enquiries are the public "enquire / offer" submissions. All real data.
export default function AgentHome() {
  const { money } = useSettings();
  const { user, company, canEdit } = useAuth();
  const [listings, setListings] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      getUnits(),
      getBookingInquiries().catch(() => []),
      getTenants().catch(() => []),
    ])
      .then(([u, i, t]) => { setListings(u); setEnquiries(i || []); setContacts(t || []); })
      .catch((e) => setError(readApiError(e, 'load your listings')))
      .finally(() => setLoading(false));
  }, []);

  const total = listings.length;
  const pending = useMemo(() => enquiries.filter((i) => i.status === 'pending'), [enquiries]);
  const purchaseEnq = pending.filter((i) => i.inquiry_type === 'purchase').length;
  const recent = useMemo(() => [...enquiries].sort((a, b) => {
    // pending first, then by created_at desc if present
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  }).slice(0, 6), [enquiries]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';
  const hasListings = total > 0;

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* Hero */}
      <section className="relative rounded-[28px] overflow-hidden mb-6 shadow-lift bg-ink min-h-[420px]">
        <img src="/bg1.jpg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = '/app1.jpg'; } }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.5) 0%, rgba(20,16,12,0.12) 32%, rgba(20,16,12,0.5) 76%, rgba(20,16,12,0.88) 100%)' }} />
        <div className="relative z-10 flex flex-col justify-between gap-8 min-h-[420px] p-6 sm:p-9 md:p-10">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-3">
                Listings <span className="text-white/40">—</span> Enquiries <span className="text-white/40">—</span> Contacts
              </div>
              <h1 className="font-serif text-white leading-[1.04] text-[34px] sm:text-[48px] md:text-[54px]">
                {greeting},<br /><span className="text-gold-light">{firstName}.</span>
              </h1>
              <p className="text-white/80 text-sm sm:text-base mt-4 max-w-md">
                {hasListings
                  ? `${total} ${total === 1 ? 'listing' : 'listings'} live · ${pending.length} enquir${pending.length === 1 ? 'y' : 'ies'} waiting on you.`
                  : 'Add your first listing to start taking enquiries from buyers.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-6">
                <Link to="/units/onboard"
                  className="inline-flex items-center gap-2 rounded-full bg-white text-ink px-5 py-3 text-sm font-medium hover:bg-white/90 transition shadow-soft">
                  Add a listing <IconArrowRight width={16} height={16} />
                </Link>
                <a href={publicHref} target={company?.slug ? '_blank' : undefined} rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-white text-sm font-medium group">
                  <span className="w-10 h-10 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
                    <IconArrowRight width={16} height={16} />
                  </span>
                  Share your listings
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The home hub — every app this role manages, in one grid. */}
      <AppLauncher />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Listings" value={total} icon={IconBuilding} sub="Properties you represent" />
        <StatCard label="Enquiries waiting" value={pending.length} icon={IconCalendar} sub="Pending follow-up" />
        <StatCard label="Purchase offers" value={purchaseEnq} icon={IconSparkle} sub="Buyers ready to talk" />
        <StatCard label="Contacts" value={contacts.length} icon={IconUsers} sub="Buyers & sellers on file" />
      </div>

      {!hasListings ? (
        <GettingStarted />
      ) : (
        <>
          {/* Enquiries + listings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lx-card p-5 lg:col-span-2">
              <div className="flex items-baseline justify-between mb-3">
                <div className="lx-eyebrow">Recent enquiries</div>
                <Link to="/booking-requests" className="text-xs text-gold hover:underline">All enquiries →</Link>
              </div>
              {recent.length ? (
                <ul className="divide-y divide-line/70">
                  {recent.map((i) => (
                    <li key={i.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink truncate">{i.name || 'Enquiry'}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {i.inquiry_type === 'purchase' && <span className="pill bg-gold/10 text-gold">Purchase{i.offer_amount ? ` · ${money(i.offer_amount)}` : ''}</span>}
                          <StatusBadge status={i.status} />
                        </span>
                      </div>
                      <div className="text-xs text-stone mt-0.5">
                        {i.l_units?.unit_code ? `${i.l_units.unit_code}${i.l_units.property_name ? ` · ${i.l_units.property_name}` : ''}` : 'General enquiry'}
                        {(i.email || i.phone) ? ` · ${[i.email, i.phone].filter(Boolean).join(' · ')}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-stone">No enquiries yet — share your listings so buyers can reach you.</p>}
            </div>

            <div className="lx-card p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div className="lx-eyebrow">Your listings</div>
                <Link to="/units" className="text-xs text-gold hover:underline">All →</Link>
              </div>
              <ul className="space-y-2.5">
                {listings.slice(0, 7).map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <Link to={`/units/${u.id}`} className="min-w-0 group">
                      <span className="block text-sm text-ink group-hover:text-gold transition truncate">{u.unit_code}</span>
                      <span className="block text-xs text-stone truncate">{u.property_name || u.unit_type}{u.city ? ` · ${u.city}` : ''}</span>
                    </Link>
                    <StatusBadge status={u.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, sub, external }) {
  const inner = (
    <>
      <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0"><Icon width={18} height={18} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink truncate">{title}</span>
        <span className="block text-xs text-stone truncate">{sub}</span>
      </span>
    </>
  );
  const cls = 'lx-card lx-lift p-4 flex items-center gap-3';
  return external ? <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>;
}
