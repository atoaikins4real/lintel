import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps, quickAddActions, RECORD_SOURCES } from '../config/apps.js';
import { getTenants, getUnits, getProperties } from '../api/client.js';
import { IconGrid, IconCog, IconPlus, IconUsers, IconBuilding, IconHome } from '../components/icons.jsx';

const FETCHERS = { tenants: getTenants, units: getUnits, properties: getProperties };
const RECORD_ICON = { tenants: IconUsers, units: IconBuilding, properties: IconHome };

function recordLabel(type, r) {
  if (type === 'tenants') return {
    label: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.name || 'Unnamed',
    hint: r.lintel_id || r.email || r.phone || '',
  };
  if (type === 'units') return { label: r.unit_code || r.name || `Unit ${r.id}`, hint: [r.property_name, r.city].filter(Boolean).join(' · ') };
  if (type === 'properties') return { label: r.name || `Property ${r.id}`, hint: r.city || '' };
  return { label: String(r.id), hint: '' };
}

// One index for every place you can go: the role's apps, its create actions,
// and your real records (guests/residents, rooms/listings, buildings). Shared
// by the ⌘K palette and the on-dashboard search so they always agree.
export function useSearchIndex({ withRecords = true } = {}) {
  const { role, can } = useAuth();
  const [records, setRecords] = useState([]);

  // Apps + create actions are instant (no network).
  const staticItems = useMemo(() => {
    const apps = roleApps(role)
      .filter((a) => !a.perm || can(a.perm))
      .map((a) => ({ kind: 'Go to', label: a.label, hint: a.desc || '', to: a.to, icon: a.icon || IconGrid }));
    const home = { kind: 'Go to', label: 'Home', hint: 'Your dashboard', to: '/', icon: IconGrid };
    const settings = { kind: 'Go to', label: 'Settings', hint: 'Branding, plan and preferences', to: '/settings', icon: IconCog };
    const creates = quickAddActions(role)
      .filter((a) => !a.perm || can(a.perm))
      .map((a) => ({ kind: 'Create', label: a.label, hint: '', to: a.to, icon: a.icon || IconPlus }));
    const seen = new Set();
    return [home, ...apps, settings, ...creates].filter((c) => {
      const k = c.kind + c.to + c.label; if (seen.has(k)) return false; seen.add(k); return true;
    });
  }, [role, can]);

  // Records are fetched once per role, only the types this worker may see.
  useEffect(() => {
    if (!withRecords) { setRecords([]); return undefined; }
    let alive = true;
    const sources = (RECORD_SOURCES[role] || []).filter((s) => !s.perm || can(s.perm));
    Promise.all(sources.map((s) =>
      (FETCHERS[s.type] ? FETCHERS[s.type]() : Promise.resolve([]))
        .then((rows) => (Array.isArray(rows) ? rows : []).map((r) => {
          const { label, hint } = recordLabel(s.type, r);
          return { kind: s.kind, label, hint, to: s.to(r), icon: RECORD_ICON[s.type] || IconGrid };
        }))
        .catch(() => [])
    )).then((lists) => { if (alive) setRecords(lists.flat()); });
    return () => { alive = false; };
  }, [role, can, withRecords]);

  const all = useMemo(() => [...staticItems, ...records], [staticItems, records]);

  const search = useMemo(() => (query) => {
    const t = (query || '').trim().toLowerCase();
    if (!t) return staticItems; // empty query → just the apps/actions, not every record
    const scored = all
      .map((c) => {
        const hay = `${c.label} ${c.hint} ${c.kind} ${c.to}`.toLowerCase();
        const idx = c.label.toLowerCase().indexOf(t);
        if (hay.includes(t)) return { c, score: idx === 0 ? 0 : idx > 0 ? 1 : 2 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c);
    return scored.slice(0, 40);
  }, [all, staticItems]);

  return { all, staticItems, records, search };
}
