import { useEffect, useState } from 'react';
import { getStaffUsers, register, updateUserRole, deleteStaffUser, getRoles, readApiError } from '../api/client.js';
import RowActions from '../components/RowActions.jsx';
import Field, { TextField } from '../components/Field.jsx';
import StatCard from '../components/StatCard.jsx';
import Avatar from '../components/Avatar.jsx';
import { IconUsers, IconShield } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Two in-company roles. Stored as manager/finance; shown as Admin/Member.
const ROLE_LABEL = { manager: 'Admin', finance: 'Member', viewer: 'Member' };
const ROLE_HELP = {
  manager: 'Admin — full access: can edit everything, onboard members and change settings.',
  finance: 'Member — can create and edit records, but not onboard members or change settings.',
};

const emptyInvite = { name: '', email: '', password: '', role: 'finance' };

export default function Staff() {
  const { user, isManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
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
    getRoles().then(setRoles).catch(() => setRoles([]));
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

  // Revoking access for someone who has left — previously impossible, so
  // an ex-employee kept their login indefinitely.
  const removeUser = async (id) => {
    setError('');
    setNotice('');
    setBusyId(id);
    try {
      await deleteStaffUser(id);
      load();
    } catch (err) {
      setError(readApiError(err, 'remove that account'));
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (id, role) => {
    setError('');
    setNotice('');
    setBusyId(id);
    try {
      await updateUserRole(id, { role });
      load();
    } catch (err) {
      setError(readApiError(err, 'change that role'));
    } finally {
      setBusyId(null);
    }
  };

  // Assign (or clear) a member's custom access role.
  const assignRole = async (u, custom_role_id) => {
    setError('');
    setNotice('');
    setBusyId(u.id);
    try {
      await updateUserRole(u.id, { role: u.role, custom_role_id: custom_role_id || null });
      load();
    } catch (err) {
      setError(readApiError(err, 'set that access role'));
    } finally {
      setBusyId(null);
    }
  };

  const admins = users.filter((u) => u.role === 'manager').length;
  const members = users.length - admins;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm max-w-xl">
          Everyone with access to this company. Admins have full control and can onboard members; members
          can edit records but can&apos;t manage members or settings.
        </p>
        {isManager && (
          <button onClick={() => setShowInvite((s) => !s)} className="lx-btn-primary w-full sm:w-auto shrink-0">
            {showInvite ? 'Cancel' : '+ Add person'}
          </button>
        )}
      </div>

      {users.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatCard label="Team size" value={users.length} icon={IconUsers} sub="With access" />
          <StatCard label="Admins" value={admins} icon={IconShield} sub="Full access" />
          <StatCard label="Members" value={members} icon={IconUsers} sub="Can edit records" />
        </div>
      )}

      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}
      {notice && <div className="mb-5 lx-alert lx-alert-ok">{notice}</div>}

      {isManager && showInvite && (
        <form onSubmit={handleInvite} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Full name" required
            value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })}
          />
          <TextField
            label="Email or username" required autoCapitalize="none"
            value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })}
          />
          <TextField
            label="Temporary password" required type="text" hint="Minimum 8 characters"
            value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })}
          />
          <Field label="Role">
            <select
              className="lx-select" value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
            >
              <option value="finance">Member — can edit records</option>
              <option value="manager">Admin — full access &amp; manages members</option>
            </select>
          </Field>
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
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar name={u.name} size="md" tone={u.role === 'manager' ? 'gold' : 'neutral'} />
              <div className="min-w-0">
                <div className="font-medium text-ink truncate">
                  {u.name}
                  {u.id === user?.id && <span className="text-xs text-stone font-normal"> (you)</span>}
                </div>
                <div className="text-xs text-stone truncate">{u.email}</div>
              </div>
            </div>
            {isManager ? (
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <div className="flex flex-col gap-1.5 flex-1 sm:w-56">
                  <select
                    className="lx-select"
                    disabled={busyId === u.id}
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                  >
                    <option value="finance">Member — limited by access role</option>
                    <option value="manager">Admin — full access &amp; manages members</option>
                  </select>
                  {u.role !== 'manager' && (
                    <select
                      className="lx-select text-xs"
                      disabled={busyId === u.id}
                      value={u.custom_role_id || ''}
                      onChange={(e) => assignRole(u, e.target.value)}
                      title="Access role"
                    >
                      <option value="">Full member access</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* Removing your own account would end your session, so
                    that's blocked server-side and hidden here. */}
                {u.id !== user?.id && (
                  <RowActions
                    onDelete={() => removeUser(u.id)}
                    busy={busyId === u.id}
                    deleteLabel={`Remove ${u.name}?`}
                  />
                )}
              </div>
            ) : (
              <span className="pill bg-stone/10 text-stone shrink-0">{ROLE_LABEL[u.role] || u.role}</span>
            )}
          </div>
        ))}
        {users.length === 0 && <div className="p-6 text-stone text-sm">No staff accounts found.</div>}
      </div>
    </div>
  );
}
