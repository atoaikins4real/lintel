import { useEffect, useState } from 'react';
import { getRoles, createRole, updateRole, deleteRole, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PERMISSION_GROUPS, ROLE_TEMPLATES } from '../config/permissions.js';
import { TextField } from './Field.jsx';
import RowActions from './RowActions.jsx';

// Create and edit custom worker roles — a role is a name plus a chosen set of
// permission keys. Managers assign these to members on the Team page.
export default function RolesManager() {
  const { role } = useAuth();
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | role object
  const [form, setForm] = useState({ name: '', permissions: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getRoles().then(setRoles).catch((e) => setError(readApiError(e, 'load roles')));
  useEffect(() => { load(); }, []);

  const templates = ROLE_TEMPLATES[role] || [];

  const startNew = () => { setForm({ name: '', permissions: [] }); setEditing('new'); setError(''); };
  const startEdit = (r) => { setForm({ name: r.name, permissions: r.permissions || [] }); setEditing(r); setError(''); };
  const cancel = () => { setEditing(null); setError(''); };

  const toggle = (key) => setForm((f) => ({
    ...f,
    permissions: f.permissions.includes(key) ? f.permissions.filter((k) => k !== key) : [...f.permissions, key],
  }));

  const applyTemplate = (name, perms) => setForm((f) => ({ name: f.name || name, permissions: perms }));

  const save = async () => {
    if (!form.name.trim()) { setError('Give the role a name'); return; }
    setError(''); setBusy(true);
    try {
      if (editing === 'new') await createRole(form);
      else await updateRole(editing.id, form);
      setEditing(null);
      load();
    } catch (e) { setError(readApiError(e, 'save that role')); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true);
    try { await deleteRole(id); load(); }
    catch (e) { setError(readApiError(e, 'delete that role')); }
    finally { setBusy(false); }
  };

  return (
    <section className="lx-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg text-ink">Roles &amp; permissions</h2>
        {!editing && <button type="button" onClick={startNew} className="lx-btn-ghost text-xs shrink-0">+ New role</button>}
      </div>
      <p className="text-xs text-stone mb-4">Build custom roles for your workers — a receptionist, a housekeeper, an accountant — and give each exactly the access they need. Assign them to people on the Team page.</p>

      {error && <div className="mb-4 lx-alert lx-alert-danger">{error}</div>}

      {!editing ? (
        roles.length === 0 ? (
          <p className="text-sm text-stone">No custom roles yet. Create one to control what a worker can see and do.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{r.name}</div>
                  <div className="text-xs text-stone">{(r.permissions || []).length} permission{(r.permissions || []).length === 1 ? '' : 's'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => startEdit(r)} className="text-xs text-gold hover:underline">Edit</button>
                  <RowActions onDelete={() => remove(r.id)} busy={busy} deleteLabel={`Delete the "${r.name}" role?`} />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div>
          <TextField label="Role name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          {templates.length > 0 && (
            <div className="mt-3">
              <span className="lx-label mb-1.5">Start from a template</span>
              <div className="flex flex-wrap gap-2">
                {templates.map(([name, perms]) => (
                  <button key={name} type="button" onClick={() => applyTemplate(name, perms)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-stone hover:border-ink/30">{name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.module}>
                <div className="lx-eyebrow mb-2">{g.module}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {g.perms.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.permissions.includes(key)} onChange={() => toggle(key)} className="accent-gold w-4 h-4 shrink-0" />
                      <span className="text-ink">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <button type="button" disabled={busy} onClick={save} className="lx-btn-primary">{busy ? 'Saving…' : 'Save role'}</button>
            <button type="button" onClick={cancel} className="lx-btn-ghost">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
