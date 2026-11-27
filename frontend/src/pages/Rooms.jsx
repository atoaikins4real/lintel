import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnits, readApiError } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import StatCard from '../components/StatCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import RoomTypesManager from '../components/RoomTypesManager.jsx';
import { IconBuilding, IconHome, IconWrench } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

// Rooms are units under the hood, shown here in hotel language. Adding a room
// reuses the apartment wizard (room number = unit code, nightly = short rate).
export default function Rooms() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    getUnits().then(setUnits).catch((err) => setError(readApiError(err, 'load rooms')));
  }, []);

  const { query, setQuery, results: shown } = useSearch(
    units,
    ['unit_code', 'property_name', 'unit_type', 'city'],
    (u) => !statusFilter || u.status === statusFilter
  );

  const total = units.length;
  const ready = units.filter((u) => u.status === 'vacant' || u.status === 'occupied').length;
  const outOfOrder = units.filter((u) => u.status === 'maintenance' || u.status === 'off_market').length;

  return (
    <div>
      <p className="text-stone text-sm mb-5">Every room in your hotel — rates, condition and photos in one place.</p>

      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {total > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatCard label="Rooms" value={total} icon={IconBuilding} sub="In your hotel" />
          <StatCard label="In service" value={ready} icon={IconHome} sub="Ready to sell" />
          <StatCard label="Out of order" value={outOfOrder} icon={IconWrench} sub="Needs attention" />
        </div>
      )}

      <SearchBar
        value={query} onChange={setQuery} placeholder="Search room, type, location…"
        count={shown.length} total={total}
        action={canEdit && (
          <Link to="/units/onboard" className="lx-btn-primary w-full sm:w-auto text-center">+ Add room</Link>
        )}
      >
        <select className="lx-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
          <option value="off_market">Out of service</option>
        </select>
      </SearchBar>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shown.map((u) => (
          <Link key={u.id} to={`/units/${u.id}`} className="lx-card overflow-hidden hover:shadow-lift transition block">
            {u.photo_url ? (
              <div className="h-36 w-full overflow-hidden">
                <img src={u.photo_url} alt={u.unit_code} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="h-36 w-full bg-gradient-to-br from-ink to-ink-soft" />
            )}
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-serif text-lg text-ink">Room {u.unit_code}</span>
                <StatusBadge status={u.status} />
              </div>
              <div className="text-sm text-stone capitalize">{u.unit_type}{u.city ? ` · ${u.city}` : ''}</div>
              <div className="text-xs text-stone mt-3 pt-3 border-t border-line/70">
                {u.base_rate_short ? <span className="text-ink font-medium">{money(u.base_rate_short)}</span> : 'No rate set'}
                {u.base_rate_short ? ' / night' : ''}
              </div>
            </div>
          </Link>
        ))}
        {total > 0 && shown.length === 0 && (
          <div className="text-stone col-span-full text-sm">Nothing matches that search.</div>
        )}
        {total === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={IconBuilding}
              title="No rooms yet"
              description="Add your rooms — give each a number and a nightly rate, then you can take reservations."
              actionLabel={canEdit ? '+ Add room' : undefined}
              actionTo={canEdit ? '/units/onboard' : undefined}
            />
          </div>
        )}
      </div>

      <div className="mt-8">
        <RoomTypesManager />
      </div>
    </div>
  );
}
