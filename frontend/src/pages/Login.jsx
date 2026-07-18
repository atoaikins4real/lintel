import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBootstrapStatus, register } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconEye, IconEyeOff } from '../components/icons.jsx';

const HERO_PHOTO = 'https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?w=1800&q=80&auto=format&fit=crop';

export default function Login() {
  const { login, setSession, user } = useAuth();
  const navigate = useNavigate();
  const [needsBootstrap, setNeedsBootstrap] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState('');
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBootstrapStatus()
      .then((res) => setNeedsBootstrap(res.needsBootstrap))
      .catch((err) => {
        setApiError(
          err.response
            ? `API responded with an error (${err.response.status}): ${err.response.data?.error || 'unknown error'}`
            : `Can't reach the API at ${err.config?.baseURL || 'the configured VITE_API_URL'}. Is the backend running?`
        );
        setNeedsBootstrap(false);
      });
  }, []);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (needsBootstrap) {
        const res = await register(form);
        setSession(res.token, res.user, remember);
      } else {
        await login(form.email, form.password, remember);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const notSetUp = (provider) => setError(`${provider} sign-in isn't set up yet — use your email/username and password.`);

  return (
    <div className="min-h-screen relative overflow-hidden bg-ink">
      <img src={HERO_PHOTO} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/35" />

      {/* Bottom-left caption — desktop/tablet only */}
      <div className="hidden lg:block absolute bottom-12 left-12 max-w-sm z-10">
        <h2 className="font-serif text-white text-3xl leading-tight mb-3">
          Because Every Property
          <br />
          Deserves Attention
        </h2>
        <p className="text-white/70 text-sm">
          Tenants, units, leases, and payments — tracked in one place, not a dozen spreadsheets.
        </p>
        <div className="flex items-center gap-1.5 mt-5">
          <span className="w-6 h-1 rounded-full bg-white/90" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/35" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/35" />
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center lg:justify-end px-4 sm:px-8 lg:pr-16 py-10">
        <div className="w-full max-w-sm">
          {apiError && (
            <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
              {apiError}
            </div>
          )}

          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-lift p-6 sm:p-8">
            <div
              className="inline-flex items-center gap-2 bg-ink text-white rounded-full pl-1.5 pr-3.5 py-1.5 mb-6"
            >
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-serif shrink-0"
                style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}
              >
                L
              </span>
              <span className="text-xs font-medium">Lintel</span>
            </div>

            {needsBootstrap === null ? (
              <p className="text-stone text-sm text-center py-6">Loading&hellip;</p>
            ) : (
              <>
                <h1 className="font-serif text-2xl text-ink mb-1">
                  {needsBootstrap ? 'Create your manager account' : 'Welcome back'}
                </h1>
                <p className="text-stone text-xs mb-6">
                  {needsBootstrap
                    ? 'No accounts exist yet — the first account created here becomes the portfolio manager.'
                    : 'Sign in to your portfolio.'}
                </p>

                {error && (
                  <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {needsBootstrap && (
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1.5">Full name</label>
                      <input
                        required
                        placeholder="Your full name"
                        className="lx-input"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">Email or username</label>
                    <input
                      required
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Enter your email or username"
                      className="lx-input"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">Password</label>
                    <div className="relative">
                      <input
                        required
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password here"
                        className="lx-input pr-10"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-ink"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
                      </button>
                    </div>
                  </div>

                  {!needsBootstrap && (
                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-stone cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="rounded border-line accent-ink"
                        />
                        Remember me
                      </label>
                      <button type="button" onClick={() => setShowForgot((s) => !s)} className="text-gold hover:underline">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {showForgot && (
                    <p className="text-xs text-stone bg-panel rounded-lg px-3 py-2.5">
                      Password resets aren&apos;t wired up yet — ask your manager to create a fresh account or update it directly, for now.
                    </p>
                  )}

                  <button disabled={saving} className="lx-btn-primary w-full">
                    {saving ? 'Please wait…' : needsBootstrap ? 'Create account & sign in' : 'Login'}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-line" />
                  <span className="text-[11px] text-stone-light whitespace-nowrap">or continue with</span>
                  <div className="flex-1 h-px bg-line" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    title="Not set up yet"
                    onClick={() => notSetUp('Google')}
                    className="lx-btn-ghost justify-center gap-2 text-sm opacity-60 cursor-not-allowed"
                  >
                    <GoogleMark /> Google
                  </button>
                  <button
                    type="button"
                    title="Not set up yet"
                    onClick={() => notSetUp('Apple')}
                    className="lx-btn-ghost justify-center gap-2 text-sm opacity-60 cursor-not-allowed"
                  >
                    <AppleMark /> Apple
                  </button>
                </div>

                {!needsBootstrap && (
                  <p className="text-center text-xs text-stone mt-5">
                    Need an account? <span className="text-ink font-medium">Ask your manager to create one for you.</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.89c2.28-2.1 3.56-5.2 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.89-3c-1.08.73-2.46 1.15-4.04 1.15-3.1 0-5.73-2.09-6.67-4.9H1.3v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.33 14.34a7.2 7.2 0 0 1 0-4.68V6.57H1.3a12 12 0 0 0 0 10.86l4.03-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.57l4.03 3.09C6.27 6.84 8.9 4.75 12 4.75z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.36 1.44c.09 1.1-.32 2.14-.98 2.91-.68.79-1.79 1.4-2.87 1.31-.12-1.06.36-2.16 1.01-2.9.72-.82 1.95-1.42 2.84-1.32zM20.7 17.1c-.34.79-.75 1.53-1.24 2.22-.67.95-1.22 1.61-1.65 1.98-.66.62-1.37.94-2.12.96-.54.01-1.19-.15-1.94-.48-.76-.33-1.45-.49-2.09-.49-.66 0-1.37.16-2.14.49-.77.33-1.39.5-1.87.52-.72.03-1.44-.3-2.16-.98-.46-.4-1.04-1.09-1.73-2.07-.75-1.06-1.36-2.29-1.85-3.7-.52-1.53-.78-3.01-.78-4.44 0-1.64.35-3.05 1.06-4.24a6.3 6.3 0 0 1 2.23-2.27 5.98 5.98 0 0 1 3.02-.86c.6 0 1.42.19 2.44.56 1.02.37 1.67.56 1.96.56.22 0 .95-.22 2.18-.66 1.16-.4 2.14-.57 2.94-.5 2.17.18 3.8 1.03 4.88 2.57-1.94 1.18-2.9 2.83-2.88 4.94.02 1.65.61 3.02 1.77 4.11.53.5 1.12.89 1.78 1.16-.14.42-.29.83-.46 1.24z" />
    </svg>
  );
}
