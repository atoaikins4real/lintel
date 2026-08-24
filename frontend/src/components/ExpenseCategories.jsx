// Per-company expense category management.
//
// Categories used to be a fixed database enum shared by every subscriber,
// so adding "DSTV" meant a migration and a deploy. Landlords track
// different things, so each company now owns its list and edits it here.
//
// Archiving rather than deleting is the important behaviour: a category
// still attached to historical expenses has to keep labelling them
// correctly. Deleting it would either orphan those records or silently
// relabel them, so the API refuses — archiving hides it from the dropdown
// while leaving past reports intact.
import { useEffect, useState } from 'react';
import {
  getExpenseCategories, createExpenseCategory, updateExpenseCategory,
  deleteExpenseCategory, readApiError,
} from '../api/client.js';

export default function ExpenseCategories({ canEdit }) {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = () =>
    getExpenseCategories({ include_archived: true })
      .then(setCategories)
      .catch((err) => setError(readApiError(err, 'load your expense categories')));

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setBusyId('new');
    try {
      await createExpenseCategory({ name: newName.trim() });
      setNewName('');
      await load();
    } catch (err) {
      setError(readApiError(err, 'add that category'));
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await updateExpenseCategory(id, { name: editingName.trim() });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(readApiError(err, 'rename that category'));
    } finally {
      setBusyId(null);
    }
  };

  const setArchived = async (id, is_archived) => {
    setError('');
    setBusyId(id);
    try {
      await updateExpenseCategory(id, { is_archived });
      await load();
    } catch (err) {
      setError(readApiError(err, 'update that category'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteExpenseCategory(id);
      await load();
    } catch (err) {
      // The API refuses when expenses still reference it and explains why.
      setError(readApiError(err, 'delete that category'));
    } finally {
      setBusyId(null);
    }
  };

  const visible = showArchived ? categories : categories.filter((c) => !c.is_archived);
  const archivedCount = categories.filter((c) => c.is_archived).length;

  return (
    <section className="lx-card p-5 sm:p-6">
      <h2 className="font-serif text-lg text-ink mb-1">Expense categories</h2>
      <p className="text-xs text-stone mb-4 leading-relaxed">
        Your own list — rename these or add your own. Renovations are tracked separately, under
        Costs &amp; Repairs, so they aren&rsquo;t listed here.
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
                      title="Only possible if no expense uses it"
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
            placeholder="Add a category (e.g. Security, Waste, Ground rent)"
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
