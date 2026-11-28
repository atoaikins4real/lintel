import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReservations, getPayments, getFaults, getBookingInquiries } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconCalendar, IconArrowRight, IconWallet, IconWrench, IconUsers, IconSparkle } from './icons.jsx';

const SEEN_KEY = 'lintel_notif_seen';
const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

// "What's new" — product updates every user should see, newest first. Because
// these are code-defined they always show (even on a brand-new empty account),
// so the bell is useful from day one and literally notifies about updates.
// Add an entry (with a NEW id) whenever a feature ships.
const RELEASES = [
  { id: 'rel-2026-11-os-home', title: 'A new home screen', detail: 'Your dashboard is now a tidy desktop — a spotlight search and an app dock floating over your workspace photo.' },
  { id: 'rel-2026-11-calendar-sync', title: 'Calendar sync (Airbnb, Booking.com)', detail: 'Import other sites’ calendars so a listing never double-books, and share Lintel’s calendar back to them.' },
  { id: 'rel-2026-11-arrears', title: 'Arrears & late fees', detail: 'Overdue rent aged into buckets, with a one-click late fee — under Reports → Arrears.' },
  { id: 'rel-2026-11-rates', title: 'Room types & seasonal rates', detail: 'Group rooms into types with rate plans (hotels); set seasonal nightly prices and minimum stays per listing (short-let).' },
  { id: 'rel-2026-11-workers', title: 'Workers & custom roles', detail: 'Add your team and give each worker a custom role — a receptionist, housekeeper or accountant sees only their tools.' },
  { id: 'rel-2026-11-housekeeping', title: 'Housekeeping board', detail: 'Track every room’s cleaning status; rooms flip to “needs cleaning” on checkout.' },
  { id: 'rel-2026-11-customize', title: 'Make it yours', detail: 'Set an accent colour, a default theme, and hide the modules you don’t use in Settings.' },
  { id: 'rel-2026-11-signin', title: 'A fresh sign-in experience', detail: 'A cleaner, clearer login and a 3-step sign-up wizard.' },
  { id: 'rel-2026-11-notifications', title: 'Activity notifications', detail: 'This bell now flags arrivals, overdue rent, new enquiries and open repairs.' },
  { id: 'rel-2026-11-roles', title: 'Choose your role', detail: 'Landlord, hotelier, short-let host or estate agent — each with its own dashboard. Switch anytime in Settings.' },
  { id: 'rel-2026-11-guest-register', title: 'Guest register & tourism export', detail: 'Capture guest and travel details per stay, and export a CSV for a tourism board.' },
];

// "Coming soon" — the public roadmap, so you can see what's on the way. Purely
// informational (no unread badge); reorder or trim as plans change.
const ROADMAP = [
  { title: 'Automated email reminders', detail: 'Rent reminders, and booking & payment confirmations, sent for you.' },
  { title: 'Guest folio & taxes (hotels)', detail: 'Add incidentals and configurable taxes to one itemised invoice at checkout.' },
  { title: 'Book & pay on your public page', detail: 'Let guests book and pay you online, straight from your showcase.' },
  { title: 'Estate-agent deal pipeline', detail: 'Track enquiries through viewing, offer and close — with commission.' },
  { title: 'PDF leases, invoices & receipts', detail: 'Generate and send polished documents in a click.' },
];

function BellIcon(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-80))); } catch { /* storage may be unavailable */ }
}

// Activity alerts are derived from the account's real records; "What's new" is
// the product-update feed above. Both live in one bell with one unread count.
export default function NotificationsBell() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ reservations: [], payments: [], faults: [], inquiries: [] });
  const [seen, setSeen] = useState(loadSeen);
  // Snapshot of what was already seen when the app loaded, so "NEW" tags stay
  // visible for the whole session even after opening marks them read.
  const [initialSeen] = useState(loadSeen);

  const isStay = role === 'hotelier' || role === 'shortlet';
  const isAgent = role === 'agent';

  const load = useCallback(() => {
    const none = Promise.resolve([]);
    Promise.all([
      isStay ? getReservations().catch(() => []) : none,
      !isAgent ? getPayments().catch(() => []) : none,
      !isAgent ? getFaults().catch(() => []) : none,
      getBookingInquiries().catch(() => []),
    ]).then(([reservations, payments, faults, inquiries]) =>
      setData({ reservations, payments, faults, inquiries })
    ).catch(() => {});
  }, [isStay, isAgent]);

  useEffect(() => { load(); }, [load]);

  const activity = useMemo(() => {
    const { reservations, payments, faults, inquiries } = data;
    const out = [];
    const push = (type, count, Icon, title, detail, to, tone) => {
      if (count > 0) out.push({ id: `${type}-${TODAY}-${count}`, Icon, title, detail, to, tone });
    };

    if (isStay) {
      const arrivals = reservations.filter((r) => r.status === 'confirmed' && r.check_in === TODAY).length;
      const departures = reservations.filter((r) => r.status === 'checked_in' && r.check_out === TODAY).length;
      push('arrivals', arrivals, IconCalendar, `${arrivals} arrival${arrivals === 1 ? '' : 's'} due today`, 'Guests checking in today', '/reservations', 'info');
      push('departures', departures, IconArrowRight, `${departures} departure${departures === 1 ? '' : 's'} due today`, 'Guests checking out today', '/reservations', 'info');
    }

    if (!isAgent) {
      const overdue = payments.filter((p) => p.status === 'late' || (p.status === 'pending' && p.due_date && p.due_date < TODAY)).length;
      push('overdue', overdue, IconWallet, `${overdue} payment${overdue === 1 ? '' : 's'} overdue`, 'Due date has passed', '/payments', 'warn');

      const openRepairs = faults.filter((f) => f.status && f.status !== 'resolved').length;
      push('repairs', openRepairs, IconWrench, `${openRepairs} open repair${openRepairs === 1 ? '' : 's'}`, 'Still waiting to be fixed', '/faults-renovations', 'info');
    }

    const pending = inquiries.filter((i) => i.status === 'pending');
    if (pending.length) {
      const purchases = pending.filter((i) => i.inquiry_type === 'purchase').length;
      const detail = isAgent && purchases ? `${purchases} purchase offer${purchases === 1 ? '' : 's'} to review` : 'Waiting for your reply';
      push('enquiries', pending.length, IconUsers, `${pending.length} new enquir${pending.length === 1 ? 'y' : 'ies'}`, detail, '/booking-requests', 'info');
    }

    return out;
  }, [data, isStay, isAgent]);

  const allIds = useMemo(() => [...activity.map((a) => a.id), ...RELEASES.map((r) => r.id)], [activity]);
  const unread = allIds.filter((id) => !seen.has(id)).length;

  const openMenu = () => {
    setOpen(true);
    load();
    const next = new Set(seen);
    allIds.forEach((id) => next.add(id));
    setSeen(next);
    saveSeen(next);
  };

  const go = (to) => { setOpen(false); if (to) navigate(to); };

  return (
    <div className="relative">
      <button type="button" onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Notifications" title="Notifications" className="lx-icon-btn relative">
        <BellIcon width={16} height={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gold text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 lx-glass rounded-2xl shadow-lift overflow-hidden">
            <div className="px-4 py-3 border-b border-line/70">
              <span className="font-serif text-base text-ink">Notifications</span>
            </div>

            <div className="max-h-[66vh] overflow-y-auto">
              {/* Activity */}
              {activity.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 lx-eyebrow text-stone">What needs attention</div>
                  <ul className="divide-y divide-line/60">
                    {activity.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => go(n.to)} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-panel/60 transition">
                          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${n.tone === 'warn' ? 'bg-rose-500/12 text-rose-600' : 'bg-gold/12 text-gold'}`}>
                            <n.Icon width={16} height={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-ink">{n.title}</span>
                            <span className="block text-xs text-stone">{n.detail}</span>
                          </span>
                          <IconArrowRight width={15} height={15} className="text-stone mt-1 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* What's new */}
              <div className="px-4 pt-3 pb-1 lx-eyebrow text-stone flex items-center gap-1.5">
                <IconSparkle width={12} height={12} className="text-gold" /> What’s new
              </div>
              <ul className="divide-y divide-line/60">
                {RELEASES.map((r) => {
                  const isNew = !initialSeen.has(r.id);
                  return (
                    <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0">
                        <IconSparkle width={16} height={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">{r.title}{isNew && <span className="ml-2 align-middle text-[10px] font-semibold text-gold">NEW</span>}</span>
                        <span className="block text-xs text-stone">{r.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Coming soon — the roadmap of what's on the way. */}
              <div className="px-4 pt-3 pb-1 lx-eyebrow text-stone flex items-center gap-1.5 border-t border-line/60 mt-1">
                <IconSparkle width={12} height={12} className="text-stone" /> Coming soon
              </div>
              <ul className="divide-y divide-line/60">
                {ROADMAP.map((r) => (
                  <li key={r.title} className="px-4 py-3 flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-panel border border-line text-stone flex items-center justify-center shrink-0">
                      <IconSparkle width={16} height={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{r.title}<span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-stone">Soon</span></span>
                      <span className="block text-xs text-stone">{r.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {activity.length === 0 && (
                <div className="px-4 py-3 text-center text-[11px] text-stone">No account alerts right now — you’re all caught up.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
