import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBootstrapStatus, register, signup, forgotPassword, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconEye, IconEyeOff } from '../components/icons.jsx';

const HERO_PHOTO = 'https://images.unsplash.com/photo-1759372945658-1e9f56e751bd?w=1800&q=80&auto=format&fit=crop';

export default function Login() {
  const { login, setSession, user } = useAuth();
  const navigate = useNavigate();
  const [needsBootstrap, setNeedsBootstrap] = useState(null);
  const [mode, setMode] = useState('login'); // 'login' | 'signup' (bootstrap overrides both)
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '' });
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState('');
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
      } else if (mode === 'signup') {
        const res = await signup(form);
        setSession(res.token, res.user, remember, res.company);
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

  const handleForgot = async () => {
    setError('');
    setForgotBusy(true);
    try {
      const res = await forgotPassword(forgotEmail.trim());
      // The API answers identically whether or not the address exists, so
      // this never reveals who has an account.
      setForgotSent(res.message);
    } catch (err) {
      setError(readApiError(err, 'send a reset link'));
    } finally {
      setForgotBusy(false);
    }
  };

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
                  {needsBootstrap ? 'Create your manager account' : mode === 'signup' ? 'Start your free trial' : 'Welcome back'}
                </h1>
                <p className="text-stone text-xs mb-6">
                  {needsBootstrap
                    ? 'No accounts exist yet — the first account created here becomes the portfolio manager.'
                    : mode === 'signup'
                    ? 'Set up your own private workspace, pre-loaded with sample properties so you can explore a working system straight away.'
                    : 'Sign in to your portfolio.'}
                </p>

                {error && (
                  <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {(needsBootstrap || mode === 'signup') && (
                    <>
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
                      <div>
                        <label className="block text-xs font-medium text-ink mb-1.5">Company name</label>
                        <input
                          placeholder="Your company or agency"
                          className="lx-input"
                          value={form.company_name}
                          onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                        />
                        <p className="text-[11px] text-stone mt-1">
                          You can change this later in Settings.
                        </p>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink mb-1.5">
                      {mode === 'signup' && !needsBootstrap ? 'Email' : 'Email or username'}
                    </label>
                    <input
                      required
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder={mode === 'signup' && !needsBootstrap ? 'you@example.com' : 'Enter your email or username'}
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
                    <div className="bg-panel rounded-lg px-3 py-3 space-y-2">
                      {forgotSent ? (
                        <p className="text-xs text-emerald-700">{forgotSent}</p>
                      ) : (
                        <>
                          <p className="text-xs text-stone">
                            Enter the email on your account and we&apos;ll send a reset link.
                          </p>
                          <input
                            type="email"
                            placeholder="you@example.com"
                            className="lx-input"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                          />
                          <button
                            type="button"
                            disabled={forgotBusy || !forgotEmail.trim()}
                            onClick={handleForgot}
                            className="lx-btn-ghost text-xs w-full"
                          >
                            {forgotBusy ? 'Sending…' : 'Send reset link'}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <button disabled={saving} className="lx-btn-primary w-full">
                    {saving
                      ? 'Please wait…'
                      : needsBootstrap
                      ? 'Create account & sign in'
                      : mode === 'signup'
                      ? 'Create my workspace'
                      : 'Login'}
                  </button>
                </form>

                {/* Google/Apple buttons were removed rather than left
                    decorative — a sign-in option that only says "not set
                    up yet" when clicked is worse than not offering it. */}

                {!needsBootstrap && (
                  <p className="text-center text-xs text-stone mt-5">
                    {mode === 'signup' ? (
                      <>
                        Have an account already?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            setError('');
                          }}
                          className="text-gold hover:underline font-medium"
                        >
                          Log in
                        </button>
                      </>
                    ) : (
                      <>
                        New here?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setMode('signup');
                            setError('');
                          }}
                          className="text-gold hover:underline font-medium"
                        >
                          Set up your company
                        </button>{' '}
                        — or ask your manager for staff access.
                      </>
                    )}
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


