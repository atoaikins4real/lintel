// The company's list of utility TYPES.
//
// Only the names live here. What each one costs is set per apartment (see
// UnitUtilities.jsx) — a service charge differs between two flats in the
// same block, so an amount at this level would be wrong more often than
// right.
//
// Archiving rather than deleting, for the same reason as expense
// categories: a utility still attached to apartments or to historical
// charges has to keep labelling them.
import { useEffect, useState } from 'react';
import {
  getUtilityTypes, createUtilityType, updateUtilityType,
  deleteUtilityType, readApiError,
} from '../api/client.js';

export default function UtilityTypes({ canEdit }) {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = () =>
    getUtilityTypes({ include_archived: true })
      .then(setCategories)
      .catch((err) => setError(readApiError(err, 'load your utilities')));

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setBusyId('new');
    try {
      await createUtilityType({ name: newName.trim() });
      setNewName('');
      await load();
    } catch (err) {
      setError(readApiError(err, 'add that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await updateUtilityType(id, { name: editingName.trim() });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(readApiError(err, 'rename that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const setArchived = async (id, is_archived) => {
    setError('');
    setBusyId(id);
    try {
      await updateUtilityType(id, { is_archived });
      await load();
    } catch (err) {
      setError(readApiError(err, 'update that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteUtilityType(id);
      await load();
    } catch (err) {
      // The API refuses when expenses still reference it and explains why.
      setError(readApiError(err, 'delete that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const visible = showArchived ? categories : categories.filter((c) => !c.is_archived);
  const archivedCount = categories.filter((c) => c.is_archived).length;

  return (
    <section className="lx-card p-5 sm:p-6">
      <h2 className="font-serif text-lg text-ink mb-1">Utilities</h2>
      <p className="text-xs text-stone mb-4 leading-relaxed">
        The utilities your buildings are billed for. This is just the list — the amount for each
        one is set per apartment, on that apartment&rsquo;s page, because properties differ.
      </p>

      {error && (
        <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      <ul className="space-y-1.5 mb-4">
        {visible.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0">
            {editingId === c.id ? (
              <>
                <input
                  className="lx-input flex-1 !py-1.5 text-sm"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && rename(c.id)}
                />
                <button onClick={() => rename(c.id)} disabled={busyId === c.id}
                  className="text-xs text-gold hover:underline disabled:opacity-50">Save</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-stone hover:text-ink">Cancel</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${c.is_archived ? 'text-stone-light line-through' : 'text-ink'}`}>
                  {c.name}
                </span>
                {c.is_archived && <span className="pill bg-stone/10 text-stone">Archived</span>}
                {canEdit && (
                  <>
                    <button
                      onClick={() => { setEditingId(c.id); setEditingName(c.name); }}
                      className="text-xs text-stone hover:text-ink px-1.5"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => setArchived(c.id, !c.is_archived)}
                      disabled={busyId === c.id}
                      className="text-xs text-stone hover:text-ink px-1.5 disabled:opacity-50"
                    >
                      {c.is_archived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      disabled={busyId === c.id}
                      title="Only possible if no apartment uses it"
                      className="text-xs text-rose-700 hover:text-rose-800 px-1.5 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((s) => !s)} className="text-xs text-gold hover:underline mb-4 block">
          {showArchived ? 'Hide' : `Show ${archivedCount} archived`}
        </button>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <input
            className="lx-input flex-1"
            placeholder="Add a utility (e.g. Borehole, Lift maintenance)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="lx-btn-ghost shrink-0" disabled={busyId === 'new' || !newName.trim()}>
            {busyId === 'new' ? 'Adding…' : 'Add'}
          </button>
        </form>
      )}
    </section>
  );
}
