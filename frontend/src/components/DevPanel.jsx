import { useState } from 'react';
import { devLogin } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES = [
  { id: 'manager', label: 'Manager' },
  { id: 'finance', label: 'Finance' },
  { id: 'viewer', label: 'Viewer' },
];

// Local-testing-only role switcher. Rendered by App.jsx only when
// import.meta.env.DEV is true (never shipped in a production build) AND
// VITE_DEV_MODE=true is set — so it's opt-in even during development.
export default function DevPanel() {
  const { user, setSession } = useAuth();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);

  const switchTo = async (role) => {
    setBusy(role);
    setError('');
    try {
      const res = await devLogin(role);
      setSession(res.token, res.user);
    } catch (err) {
      setError(err.response?.data?.error || 'dev-login failed — is DEV_MODE=true set in backend/.env?');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed bottom-3 left-3 z-50 max-w-[calc(100vw-1.5rem)]">
      {open ? (
        <div className="bg-ink text-white rounded-2xl shadow-lift p-3 w-56">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Dev mode</span>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-xs">
              hide
            </button>
          </div>
          <div className="text-[11px] text-white/50 mb-2 truncate">
            {user ? `Signed in: ${user.name} (${user.role})` : 'Not signed in'}
          </div>
          <div className="flex flex-col gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => switchTo(r.id)}
                disabled={busy !== null}
                className={`text-xs rounded-lg px-3 py-2 text-left transition ${
                  user?.role === r.id ? 'bg-gold text-white' : 'bg-white/[0.08] text-white/80 hover:bg-white/[0.14]'
                }`}
              >
                {busy === r.id ? 'Switching…' : `Log in as ${r.label}`}
              </button>
            ))}
          </div>
          {error && <div className="text-[10.5px] text-rose-300 mt-2">{error}</div>}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-ink text-white text-[10px] font-semibold uppercase tracking-wide rounded-full px-3 py-2 shadow-lift"
        >
          Dev
        </button>
      )}
    </div>
  );
}
