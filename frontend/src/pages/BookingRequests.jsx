import { useEffect, useState } from 'react';
import { getBookingInquiries, updateBookingInquiry } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Staff-side review of "Book now" / "Request to be notified" submissions
// from the public /showcase pages. Viewer role can see this (read-only,
// same as everywhere else); only manager/finance can approve or decline.
export default function BookingRequests() {
  const { canEdit } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => getBookingInquiries(filter ? { status: filter } : undefined).then(setInquiries);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const act = async (id, status) => {
    setBusyId(id);
    try {
      await updateBookingInquiry(id, status);
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Requests submitted from the public showcase pages.</p>
        <select className="lx-select w-full sm:w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      <div className="lx-card divide-y divide-line/70">
        {inquiries.map((i) => (
          <div key={i.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-medium text-ink">{i.name}</span>
                <StatusBadge status={i.status} />
              </div>
              <div className="text-xs text-stone">
                {i.l_units?.unit_code}
                {i.l_units?.property_name ? ` · ${i.l_units.property_name}` : ''}
              </div>
              <div className="text-xs text-stone mt-1">
                {[i.email, i.phone].filter(Boolean).join(' · ') || 'No contact info provided'}
                {(i.start_date || i.end_date) && ` · ${i.start_date || '?'} → ${i.end_date || 'open'}`}
              </div>
              {i.message && <div className="text-xs text-stone mt-1 italic">&ldquo;{i.message}&rdquo;</div>}
            </div>
            {canEdit && i.status === 'pending' && (
              <div className="flex gap-2 shrink-0">
                <button
                  disabled={busyId === i.id}
                  onClick={() => act(i.id, 'approved')}
                  className="lx-btn-primary text-xs px-3 py-1.5"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === i.id}
                  onClick={() => act(i.id, 'declined')}
                  className="lx-btn-ghost text-xs px-3 py-1.5"
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        ))}
        {inquiries.length === 0 && <div className="p-6 text-stone text-sm">No booking requests yet.</div>}
      </div>
    </div>
  );
}
