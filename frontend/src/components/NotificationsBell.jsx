import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReservations, getPayments, getFaults, getBookingInquiries } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconCalendar, IconArrowRight, IconWallet, IconWrench, IconUsers } from './icons.jsx';

const SEEN_KEY = 'lintel_notif_seen';
const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());

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
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-60))); } catch { /* storage may be unavailable */ }
}

// A lightweight activity bell. Rather than a new backend events table, it
// derives "what needs your attention" from the records the account already
// has — arrivals due, overdue rent, new enquiries, open repairs — tailored to
// the company's role. Read-state lives in localStorage per browser.
export default function NotificationsBell() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ reservations: [], payments: [], faults: [], inquiries: [] });
  const [seen, setSeen] = useState(loadSeen);

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

  const items = useMemo(() => {
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
      const detail = isAgent && purchases
        ? `${purchases} purchase offer${purchases === 1 ? '' : 's'} to review`
        : 'Waiting for your reply';
      push('enquiries', pending.length, IconUsers, `${pending.length} new enquir${pending.length === 1 ? 'y' : 'ies'}`, detail, '/booking-requests', 'info');
    }

    return out;
  }, [data, isStay, isAgent]);

  const unread = items.filter((i) => !seen.has(i.id)).length;

  const openMenu = () => {
    setOpen(true);
    load(); // refresh on open
    if (items.length) {
      const next = new Set(seen);
      items.forEach((i) => next.add(i.id));
      setSeen(next);
      saveSeen(next);
    }
  };

  const go = (to) => { setOpen(false); navigate(to); };

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
            <div className="px-4 py-3 border-b border-line/70 flex items-center justify-between">
              <span className="font-serif text-base text-ink">Notifications</span>
              <span className="text-[11px] text-stone">{items.length ? 'What needs attention' : ''}</span>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-sm text-ink font-medium">You’re all caught up</div>
                <div className="text-xs text-stone mt-1">New arrivals, payments and enquiries will show up here.</div>
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto divide-y divide-line/60">
                {items.map((n) => (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
