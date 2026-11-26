import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnits, getBookingInquiries, getTenants, readApiError } from '../../api/client.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import GettingStarted from '../../components/GettingStarted.jsx';
import DashboardTop from '../../components/DashboardTop.jsx';
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

      {/* Compact hero + search + app dock. */}
      <DashboardTop />

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
