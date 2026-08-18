import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword, readApiError } from '../api/client.js';
import { IconEye, IconEyeOff } from '../components/icons.jsx';

const HERO_PHOTO = 'https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?w=1800&q=80&auto=format&fit=crop';

// Landing page for the emailed reset link. Public — the token in the URL
// is the credential, so no session is required.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) return setError("Those passwords don't match.");
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setSaving(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(readApiError(err, 'reset your password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-ink">
      <img src={HERO_PHOTO} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/35" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-lift p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 bg-ink text-white rounded-full pl-1.5 pr-3.5 py-1.5 mb-6">
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-serif shrink-0"
                style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}
              >
                L
              </span>
              <span className="text-xs font-medium">Lintel</span>
            </div>

            {!token ? (
              <>
                <h1 className="font-serif text-2xl text-ink mb-1">Link incomplete</h1>
                <p className="text-stone text-xs mb-5">
                  This page needs the link from your reset email. Try opening it again, or request a new one.
                </p>
                <Link to="/login" className="lx-btn-primary w-full text-center">Back to sign in</Link>
              </>
            ) : done ? (
              <>
                <h1 className="font-serif text-2xl text-ink mb-1">Password changed</h1>
                <p className="text-stone text-xs mb-5">
                  You can sign in with your new password now. Taking you there…
                </p>
                <Link to="/login" className="lx-btn-primary w-full text-center">Sign in</Link>
              </>
            ) : (
              <>
                <h1 className="font-serif text-2xl text-ink mb-1">Set a new password</h1>
                <p className="text-stone text-xs mb-6">At least 8 characters.</p>

                {error && (
                  <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">New password</label>
                    <div className="relative">
                      <input
                        required
                        type={show ? 'text' : 'password'}
                        className="lx-input pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-ink"
                      >
                        {show ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">Confirm new password</label>
                    <input
                      required
                      type={show ? 'text' : 'password'}
                      className="lx-input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  <button disabled={saving} className="lx-btn-primary w-full">
                    {saving ? 'Saving…' : 'Change password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
