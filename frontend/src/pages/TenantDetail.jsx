import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTenant, recomputeTenant } from '../api/client.js';
import TierBadge from '../components/TierBadge.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function TenantDetail() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const { id } = useParams();
  const [tenant, setTenant] = useState(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = () => getTenant(id).then(setTenant);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!tenant) return <div className="text-stone">Loading&hellip;</div>;

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await recomputeTenant(id);
      await load();
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="lx-eyebrow">{tenant.lintel_id}</span>
          <TierBadge tier={tenant.tier} />
        </div>
        {canEdit && (
          <button onClick={handleRecompute} disabled={recomputing} className="lx-btn-primary w-full sm:w-auto">
            {recomputing ? 'Recomputing…' : 'Recompute score & tier'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard label="Score" value={tenant.score} />
        <StatCard label="Total stays" value={tenant.total_stays} />
        <StatCard label="On-time payments" value={`${tenant.on_time_payment_rate}%`} />
        <StatCard label="Total paid" value={money(tenant.total_paid)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Section title="Contact">
          <Detail label="Email" value={tenant.email || '—'} />
          <Detail label="Phone" value={tenant.phone || '—'} />
          <Detail label="Nationality" value={tenant.nationality || '—'} />
          <Detail
            label="ID document"
            value={tenant.id_document_number ? `${tenant.id_document_type} · ${tenant.id_document_number}` : '—'}
          />
        </Section>

        <Section title="Tier history">
          {tenant.tier_events?.length ? (
            <ul className="space-y-3">
              {tenant.tier_events.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="font-medium text-ink">{e.event_type}</span>
                  <span className="text-stone"> — {e.detail}</span>
                  <div className="text-xs text-stone mt-0.5">{new Date(e.created_at).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone">No tier events yet.</p>
          )}
        </Section>

        <Section title="Leases">
          {tenant.leases?.length ? (
            <ul className="space-y-2.5 text-sm">
              {tenant.leases.map((l) => (
                <li key={l.id} className="border-b border-line/70 pb-2.5">
                  {l.stay_type.replace('_', ' ')} &middot; {l.start_date} &rarr; {l.end_date || 'ongoing'} &middot;{' '}
                  {money(l.agreed_rate)}/{l.rate_period} &middot; {l.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone">No leases yet.</p>
          )}
        </Section>

        <Section title="Payments">
          {tenant.payments?.length ? (
            <ul className="space-y-2.5 text-sm">
              {tenant.payments.map((p) => (
                <li key={p.id} className="border-b border-line/70 pb-2.5">
                  {p.payment_date || p.due_date} &middot; {money(p.amount, p.currency)} &middot; {p.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone">No payments yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="lx-card p-5 sm:p-6">
      <div className="font-serif text-lg text-ink mb-4">{title}</div>
      {children}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between text-sm py-2 border-b border-line/70 last:border-0">
      <span className="text-stone">{label}</span>
      <span className="text-ink text-right">{value}</span>
    </div>
  );
}
