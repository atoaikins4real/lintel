import { useEffect, useMemo, useState } from 'react';
import { getUnits, updateUnit, readApiError } from '../api/client.js';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import { IconSparkle, IconBuilding, IconWrench, IconHome } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// The housekeeping board: every room grouped by its cleaning state so a team
// can see at a glance what needs attention. Rooms are l_units; a guest
// checking out flips the room to "dirty" automatically (see reservations.js).
const STATUSES = [
  ['dirty', 'Needs cleaning', 'bg-rose-500/12 text-rose-600'],
  ['clean', 'Clean', 'bg-emerald-500/12 text-emerald-600'],
  ['inspected', 'Inspected', 'bg-gold/12 text-gold'],
  ['out_of_service', 'Out of service', 'bg-stone/15 text-stone'],
];
const LABEL = Object.fromEntries(STATUSES.map(([v, l]) => [v, l]));
const hk = (u) => u.housekeeping_status || 'clean';

export default function Housekeeping() {
  const { canEdit } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => getUnits().then(setRooms).catch((e) => setError(readApiError(e, 'load rooms')));
  useEffect(() => { load(); }, []);

  const setStatus = async (id, s) => {
    setError(''); setBusyId(id);
    // Optimistic update so the board feels instant.
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, housekeeping_status: s } : r)));
    try { await updateUnit(id, { housekeeping_status: s }); }
    catch (e) { setError(readApiError(e, 'update that room')); load(); }
    finally { setBusyId(null); }
  };

  const { query, setQuery, results: shown } = useSearch(rooms, ['unit_code', 'property_name']);

  const counts = useMemo(() => {
    const c = { dirty: 0, clean: 0, inspected: 0, out_of_service: 0, occupied: 0 };
    rooms.forEach((r) => { c[hk(r)] = (c[hk(r)] || 0) + 1; if (r.status === 'occupied') c.occupied += 1; });
    return c;
  }, [rooms]);

  const groups = STATUSES.map(([value, label]) => ({ value, label, rows: shown.filter((r) => hk(r) === value) }));
  const total = rooms.length;

  return (
    <div>
      <p className="text-stone text-sm mb-5">Every room's cleaning status — rooms flip to “needs cleaning” the moment a guest checks out.</p>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Needs cleaning" value={counts.dirty} icon={IconSparkle} sub="Awaiting housekeeping" />
          <StatCard label="Ready" value={counts.clean + counts.inspected} icon={IconHome} sub="Clean or inspected" />
          <StatCard label="In use" value={counts.occupied} icon={IconBuilding} sub="Guests in room now" />
          <StatCard label="Out of service" value={counts.out_of_service} icon={IconWrench} sub="Blocked" />
        </div>
      )}

      <SearchBar value={query} onChange={setQuery} placeholder="Search room…" count={shown.length} total={total} />

      {total === 0 ? (
        <EmptyState icon={IconBuilding} title="No rooms yet"
          description="Add your rooms first, then housekeeping can track each one's cleaning status here." />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            g.rows.length === 0 ? null : (
              <div key={g.value}>
                <h2 className="font-serif text-xl text-ink mb-3">{g.label} <span className="text-sm text-stone font-sans">· {g.rows.length}</span></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.rows.map((r) => (
                    <div key={r.id} className="lx-card p-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="font-medium text-ink">Room {r.unit_code}</span>
                        {r.status === 'occupied' && <span className="pill bg-stone/10 text-stone">In use</span>}
                      </div>
                      {canEdit ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {STATUSES.map(([val, label, tone]) => (
                            <button key={val} type="button" disabled={busyId === r.id}
                              onClick={() => setStatus(r.id, val)}
                              className={`text-xs rounded-lg px-2 py-1.5 font-medium transition ${
                                hk(r) === val ? tone : 'bg-panel text-stone hover:text-ink'
                              }`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className={`pill ${STATUSES.find((s) => s[0] === hk(r))?.[2] || ''}`}>{LABEL[hk(r)]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
          {shown.length === 0 && <p className="text-stone text-sm">Nothing matches that search.</p>}
        </div>
      )}
    </div>
  );
}
