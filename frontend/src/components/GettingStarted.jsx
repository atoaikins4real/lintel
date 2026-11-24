import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IconHome, IconBuilding, IconUsers, IconWallet, IconCalendar, IconArrowRight } from './icons.jsx';

const KEY = 'lintel_getting_started_hidden';

// A friendly first-run guide. It explains, per role, what Lintel does and what
// each main page is for — so a brand-new account (which now starts EMPTY, with
// no sample data) teaches itself instead of leaving the subscriber guessing.
// Shown by each dashboard only while the workspace is empty, and dismissible.
const GUIDE = {
  landlord: {
    pitch: 'Lintel keeps your buildings, residents, rent and repairs in one calm place. Here’s how to set up — it only takes a few minutes.',
    steps: [
      [IconHome, 'Add a building', 'Create the block or estate your homes sit in.', '/properties/onboard'],
      [IconBuilding, 'Add apartments', 'List each home with its rent, rooms and photos.', '/units/onboard'],
      [IconUsers, 'Add residents', 'Record who’s renting, with contacts and documents.', '/tenants/onboard'],
      [IconWallet, 'Record payments', 'Log rent as it comes in and see who has paid.', '/payments'],
    ],
    more: 'Repairs, access cards, reports and a shareable public page are all in the menu on the left.',
  },
  hotelier: {
    pitch: 'Lintel runs your front desk — rooms, reservations, guests and payments. Here’s how to get going.',
    steps: [
      [IconBuilding, 'Add your rooms', 'Give each room a number and a nightly rate.', '/units/onboard'],
      [IconCalendar, 'Take a reservation', 'Book a stay on a calendar that never double-books.', '/reservations'],
      [IconUsers, 'Keep a guest register', 'Capture guest and travel details for each stay.', '/reservations'],
      [IconHome, 'Share your rooms', 'Put a beautiful page in front of guests.', '/settings'],
    ],
    more: 'Check-ins, payments, repairs and reports are all in the menu on the left.',
  },
  shortlet: {
    pitch: 'Lintel keeps your short-stay places, bookings and payouts in one clash-free calendar. Here’s how to start.',
    steps: [
      [IconBuilding, 'Add a listing', 'Set up each place you let, with a nightly rate.', '/units/onboard'],
      [IconCalendar, 'Open your calendar', 'Block dates and take bookings in one view.', '/reservations'],
      [IconUsers, 'Keep a guest register', 'Hold guest and travel details for every stay.', '/reservations'],
      [IconWallet, 'Track your payouts', 'See what each stay earns.', '/payments'],
    ],
    more: 'Guests, repairs, reports and a shareable listings page are in the menu on the left.',
  },
  agent: {
    pitch: 'Lintel keeps your listings, buyer enquiries and contacts in one place. Here’s how to begin.',
    steps: [
      [IconBuilding, 'Add a listing', 'List a property for sale, with photos and details.', '/units/onboard'],
      [IconHome, 'Share your listings', 'Put a polished page in front of buyers.', '/settings'],
      [IconCalendar, 'Follow up enquiries', 'Buyer enquiries land in one place to action.', '/booking-requests'],
      [IconUsers, 'Keep contacts', 'Hold every buyer and seller detail to hand.', '/tenants/onboard'],
    ],
    more: 'Reports and your public page are in the menu on the left.',
  },
};

export default function GettingStarted() {
  const { role, user } = useAuth();
  const g = GUIDE[role] || GUIDE.landlord;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  if (hidden) return null;

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* storage may be unavailable */ }
    setHidden(true);
  };

  return (
    <section className="lx-card p-6 sm:p-8 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="lx-eyebrow text-gold">Getting started</div>
        <button type="button" onClick={dismiss} className="text-xs text-stone hover:text-ink shrink-0">Hide this</button>
      </div>
      <h2 className="font-serif text-2xl text-ink">Welcome to Lintel, {firstName}.</h2>
      <p className="text-sm text-stone mt-1.5 max-w-2xl">{g.pitch}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        {g.steps.map(([Icon, title, desc, to], i) => (
          <Link key={title} to={to} className="group lx-card lx-lift p-4 flex items-start gap-3 bg-panel/40">
            <span className="relative shrink-0">
              <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center"><Icon width={18} height={18} /></span>
              <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-ink text-canvas text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{title}</span>
                <IconArrowRight width={15} height={15} className="text-stone group-hover:text-gold transition shrink-0" />
              </span>
              <span className="block text-xs text-stone mt-0.5">{desc}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-stone mt-4">{g.more}</p>
    </section>
  );
}
