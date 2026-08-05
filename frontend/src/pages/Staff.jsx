import { useEffect, useState } from 'react';
import { getStaffUsers, register, updateUserRole, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_HELP = {
  manager: 'Full access — can edit everything and manage staff.',
  finance: 'Can create and edit records, but not manage staff or settings.',
  viewer: 'Read-only across the whole app.',
};

const emptyInvite = { name: '', email: '', password: '', role: 'viewer' };

export default function Staff() {
  const { user, isManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [invite, setInvite] = useState(emptyInvite);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () =>
    getStaffUsers()
      .then(setUsers)
      .catch((err) => setError(readApiError(err, 'load staff')));

  useEffect(() => {
    load();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await register(invite);
      setNotice(`Account created for ${invite.email}. Share the password with them so they can sign in.`);
      setInvite(emptyInvite);
      setShowInvite(false);
      load();
    } catch (err) {
      setError(readApiError(err, 'create that account'));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (id, role) => {
    setError('');
    setNotice('');
    setBusyId(id);
    try {
      await updateUserRole(id, role);
      load();
    } catch (err) {
      setError(readApiError(err, 'change that role'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">
          Everyone with access to this Lintel account. Self-service signups arrive as read-only viewers.
        </p>
        {isManager && (
          <button onClick={() => setShowInvite((s) => !s)} className="lx-btn-primary w-full sm:w-auto">
            {showInvite ? 'Cancel' : '+ Add person'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}
      {notice && (
        <div className="mb-5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          {notice}
        </div>
      )}

      {isManager && showInvite && (
        <form onSubmit={handleInvite} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            required placeholder="Full name" className="lx-input"
            value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })}
          />
          <input
            required placeholder="Email or username" className="lx-input" autoCapitalize="none"
            value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <input
            required type="text" placeholder="Temporary password (min 8 characters)" className="lx-input"
            value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })}
          />
          <select
            className="lx-select" value={invite.role}
            onChange={(e) => setInvite({ ...invite, role: e.target.value })}
          >
            <option value="viewer">Viewer — read-only</option>
            <option value="finance">Finance — can edit records</option>
            <option value="manager">Manager — full access</option>
          </select>
          <p className="text-xs text-stone sm:col-span-2">
            {ROLE_HELP[invite.role]} You&apos;ll need to share the password with them directly — Lintel doesn&apos;t
            send invitation emails yet.
          </p>
          <button disabled={saving} className="lx-btn-gold sm:col-span-2 justify-self-start w-full sm:w-auto">
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      <div className="lx-card divide-y divide-line/70">
        {users.map((u) => (
          <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink">
                {u.name}
                {u.id === user?.id && <span className="text-xs text-stone font-normal"> (you)</span>}
              </div>
              <div className="text-xs text-stone">{u.email}</div>
            </div>
            {isManager ? (
              <select
                className="lx-select w-full sm:w-56 shrink-0"
                disabled={busyId === u.id}
                value={u.role}
                onChange={(e) => changeRole(u.id, e.target.value)}
              >
                <option value="viewer">Viewer — read-only</option>
                <option value="finance">Finance — can edit records</option>
                <option value="manager">Manager — full access</option>
              </select>
            ) : (
              <span className="pill bg-stone/10 text-stone capitalize shrink-0">{u.role}</span>
            )}
          </div>
        ))}
        {users.length === 0 && <div className="p-6 text-stone text-sm">No staff accounts found.</div>}
      </div>
    </div>
  );
}
