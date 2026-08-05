import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getUnit, getUnitPerformance, getExpenses, getRenovations, getFaults, updateUnit } from '../api/client.js';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { STOCK_PHOTOS, suggestedPhotos } from '../data/stockPhotos.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function UnitDetail() {
  const { id } = useParams();
  const { canEdit } = useAuth();
  const [unit, setUnit] = useState(null);
  const [perf, setPerf] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [faults, setFaults] = useState([]);
  const [copied, setCopied] = useState(false);
  const [editingGallery, setEditingGallery] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  useEffect(() => {
    getUnit(id).then(setUnit);
    getUnitPerformance(id).then(setPerf);
    getExpenses({ unit_id: id }).then(setExpenses);
    getRenovations({ unit_id: id }).then(setRenovations);
    getFaults({ unit_id: id }).then(setFaults);
  }, [id]);

  const shareUrl = `${window.location.origin}/showcase/${id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  const togglePhoto = async (url) => {
    const current = unit.photo_urls || [];
    const next = current.includes(url) ? current.filter((u) => u !== url) : [...current, url];
    setSavingGallery(true);
    try {
      const updated = await updateUnit(id, { photo_urls: next });
      setUnit(updated);
    } finally {
      setSavingGallery(false);
    }
  };

  if (!unit) return <div className="text-stone">Loading&hellip;</div>;

  return (
    <div>
      {unit.photo_url ? (
        <div className="h-48 sm:h-64 w-full rounded-2xl overflow-hidden mb-5">
          <img src={unit.photo_url} alt={unit.unit_code} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-48 sm:h-64 w-full rounded-2xl bg-gradient-to-br from-ink to-ink-soft mb-5" />
      )}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <span className="lx-eyebrow">{unit.class}</span>
        <StatusBadge status={unit.status} />
      </div>
      <p className="text-stone text-sm mb-3">{unit.property_name}{unit.city ? ` · ${unit.city}` : ''}</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={copyLink} className="lx-btn-ghost text-xs px-3 py-1.5">
          {copied ? 'Link copied ✓' : 'Copy public share link'}
        </button>
        {canEdit && (
          <button onClick={() => setEditingGallery((s) => !s)} className="lx-btn-ghost text-xs px-3 py-1.5">
            {editingGallery ? 'Done' : `Manage showcase gallery (${(unit.photo_urls || []).length})`}
          </button>
        )}
      </div>

      {canEdit && editingGallery && (
        <div className="lx-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="lx-eyebrow">
              Tap photos to add/remove them from the public slideshow at {shareUrl}
            </span>
            <button type="button" onClick={() => setShowAllPhotos((s) => !s)} className="text-xs text-gold hover:underline shrink-0">
              {showAllPhotos ? 'Show suggested only' : 'Show all photos'}
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {(showAllPhotos ? STOCK_PHOTOS : suggestedPhotos(unit.unit_type, unit.class)).map((p) => {
              const selected = (unit.photo_urls || []).includes(p.full);
              return (
                <button
                  type="button"
                  key={p.id}
                  disabled={savingGallery}
                  title={`${p.label} — photo by ${p.credit} on Unsplash`}
                  onClick={() => togglePhoto(p.full)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                    selected ? 'border-gold ring-2 ring-gold/30' : 'border-transparent hover:border-line'
                  }`}
                >
                  <img src={p.thumb} alt={p.label} className="w-full h-full object-cover" loading="lazy" />
                  {selected && (
                    <span className="absolute inset-0 bg-ink/20 flex items-center justify-center">
                      <span className="w-5 h-5 rounded-full bg-gold text-white text-xs flex items-center justify-center">✓</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {perf && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Revenue" value={`GHS ${Number(perf.revenue).toLocaleString()}`} />
          <StatCard label="Costs" value={`GHS ${Number(perf.total_costs).toLocaleString()}`} />
          <StatCard label="Net Yield" value={`GHS ${Number(perf.net_yield).toLocaleString()}`} />
          <StatCard label="Occupancy" value={`${perf.occupancy_rate}%`} />
          <StatCard label="Open Faults" value={perf.open_faults} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <ListSection title="Expenses" items={expenses} render={(e) => `${e.expense_date} · ${e.category} · GHS ${e.amount}`} />
        <ListSection
          title="Renovations"
          items={renovations}
          render={(r) => `${r.description} · GHS ${r.cost}${r.rate_before && r.rate_after ? ` · GHS ${r.rate_before} → GHS ${r.rate_after}` : ''}`}
        />
        <ListSection title="Faults" items={faults} render={(f) => `${f.reported_date} · ${f.description} · ${f.severity} · ${f.status}`} />
      </div>
    </div>
  );
}

function ListSection({ title, items, render }) {
  return (
    <div className="lx-card p-5 sm:p-6">
      <div className="font-serif text-lg text-ink mb-4">{title}</div>
      {items.length ? (
        <ul className="space-y-2.5 text-sm">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line/70 pb-2.5 last:border-0">{render(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone">None recorded.</p>
      )}
    </div>
  );
}
