import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBootstrapStatus, register, signup, forgotPassword, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { IconEye, IconEyeOff, IconWallet, IconHome, IconWrench, IconShield, IconSparkle } from '../components/icons.jsx';

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

  const isCreate = needsBootstrap || mode === 'signup';
  const heading = needsBootstrap ? 'Create your manager account' : isCreate ? 'Start your free trial' : 'Welcome back';
  const subheading = needsBootstrap
    ? 'No accounts exist yet — the first account created here becomes the manager.'
    : isCreate
    ? 'Set up your private workspace, pre-loaded with sample homes so you can explore straight away.'
    : 'Sign in to your portfolio.';
  const submitLabel = saving ? 'Please wait…' : needsBootstrap ? 'Create account & sign in' : isCreate ? 'Create my workspace' : 'Login';

  // The account form — shared by both the login (photo) and the create-account
  // (marketing) layouts so there's one source of truth for the fields.
  const formEl = (
    <>
      {error && <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        {isCreate && (
          <>
            <TextField label="Full name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label="Company name" hint="You can change this later in Settings.">
              <input className="lx-input" value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </Field>
          </>
        )}
        <TextField
          label={mode === 'signup' && !needsBootstrap ? 'Email' : 'Email or username'}
          required type="text" autoCapitalize="none" autoCorrect="off"
          hint={mode === 'signup' && !needsBootstrap ? 'you@example.com' : undefined}
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password">
          <div className="relative">
            <input required type={showPassword ? 'text' : 'password'} className="lx-input pr-10"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-ink"
              title={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <IconEyeOff width={16} height={16} /> : <IconEye width={16} height={16} />}
            </button>
          </div>
        </Field>
        {!needsBootstrap && !isCreate && (
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-stone cursor-pointer">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-line accent-ink" />
              Remember me
            </label>
            <button type="button" onClick={() => setShowForgot((s) => !s)} className="text-gold hover:underline">Forgot password?</button>
          </div>
        )}
        {showForgot && !isCreate && (
          <div className="bg-panel rounded-lg px-3 py-3 space-y-2">
            {forgotSent ? (
              <p className="text-xs text-emerald-700">{forgotSent}</p>
            ) : (
              <>
                <p className="text-xs text-stone">Enter the email on your account and we&apos;ll send a reset link.</p>
                <Field label="Account email">
                  <input type="email" className="lx-input" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                </Field>
                <button type="button" disabled={forgotBusy || !forgotEmail.trim()} onClick={handleForgot} className="lx-btn-ghost text-xs w-full">
                  {forgotBusy ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
          </div>
        )}
        <button disabled={saving} className="lx-btn-primary w-full !py-3">{submitLabel}</button>
      </form>
    </>
  );

  const toggleEl = !needsBootstrap && (
    <p className="text-center text-xs text-stone mt-5">
      {isCreate ? (
        <>Have an account already?{' '}
          <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-gold hover:underline font-medium">Log in</button>
        </>
      ) : (
        <>New here?{' '}
          <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="text-gold hover:underline font-medium">Set up your company</button>{' '}
          — or ask your manager for staff access.
        </>
      )}
    </p>
  );

  const BrandMark = ({ onLight }) => (
    <span className={`inline-flex items-center gap-2 ${onLight ? 'text-ink' : 'text-white'}`}>
      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-serif shrink-0"
        style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}>L</span>
      <span className="font-serif text-lg">Lintel</span>
    </span>
  );

  // ---------- CREATE-ACCOUNT LANDING (HomeNest-style marketing) ----------
  if (isCreate && needsBootstrap !== null) {
    const features = [
      [IconWallet, 'Collect rent online', 'Mobile money settles straight to your own account.'],
      [IconHome, 'A page for every home', 'Share a beautiful public listing with renters in one tap.'],
      [IconWrench, 'Repairs & receipts', 'Log faults, attach receipts, and see who reported what.'],
      [IconSparkle, 'Everything at a glance', 'Occupancy, income and what needs attention — in one place.'],
    ];
    const strip = [
      [IconWallet, 'Online rent', 'Mobile money'],
      [IconHome, 'Public listings', 'Share in a tap'],
      [IconWrench, 'Repairs tracked', 'Nothing slips'],
      [IconShield, 'Private & secure', 'Your data, yours'],
    ];
    return (
      <div className="lx-public min-h-screen" style={{ background: '#f4efe6' }}>
        <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandMark onLight />
          <div className="text-xs sm:text-sm text-stone">
            Have an account?{' '}
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-gold hover:underline font-medium">Log in</button>
          </div>
        </header>

        {apiError && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">{apiError}</div>
          </div>
        )}

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* Marketing */}
            <div className="lx-page order-2 lg:order-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone mb-4">
                <span className="w-6 h-px bg-gold" /> Run your rentals with ease
              </div>
              <h1 className="font-serif text-ink leading-[1.05] text-[40px] sm:text-[52px]">
                Better rentals,<br /><span className="text-gold">brighter returns.</span>
              </h1>
              <p className="text-stone text-sm sm:text-base mt-4 max-w-md leading-relaxed">
                Lintel brings your buildings, residents, rent and repairs into one calm place — and gives every
                home a beautiful page you can share with renters.
              </p>
              <ul className="mt-6 space-y-3.5 max-w-md">
                {features.map(([Icon, title, desc]) => (
                  <li key={title} className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0 mt-0.5">
                      <Icon width={17} height={17} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-ink">{title}</span>
                      <span className="block text-xs text-stone">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-stone mt-6">Free to start · No card needed · Ready in minutes.</p>
            </div>

            {/* Form card */}
            <div className="order-1 lg:order-2">
              <div className="lx-auth-card bg-white rounded-3xl shadow-lift p-6 sm:p-8 lx-page">
                <h2 className="font-serif text-2xl text-ink mb-1">{heading}</h2>
                <p className="text-stone text-xs mb-6">{subheading}</p>
                {formEl}
                {toggleEl}
              </div>
            </div>
          </div>

          {/* Feature strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-12 pt-8 border-t border-line">
            {strip.map(([Icon, title, sub]) => (
              <div key={title} className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0">
                  <Icon width={18} height={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">{title}</span>
                  <span className="block text-xs text-stone truncate">{sub}</span>
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ---------- LOGIN (photo backdrop) ----------
  return (
    <div className="min-h-screen relative bg-ink">
      <img src={HERO_PHOTO} alt="" className="fixed inset-0 w-full h-full object-cover" />
      <div className="fixed inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/35" />

      <div className="hidden lg:block fixed bottom-12 left-12 max-w-sm z-10">
        <h2 className="font-serif text-white text-3xl leading-tight mb-3">Because Every Home<br />Deserves Attention</h2>
        <p className="text-white/70 text-sm">Homes, residents, rent and repairs — tracked in one place, not a dozen spreadsheets.</p>
        <div className="flex items-center gap-1.5 mt-5">
          <span className="w-6 h-1 rounded-full bg-white/90" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/35" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/35" />
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-start lg:items-center justify-center lg:justify-end px-4 sm:px-8 lg:pr-16 py-8 sm:py-10">
        <div className="w-full max-w-sm">
          {apiError && (
            <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">{apiError}</div>
          )}
          <div className="lx-auth-card bg-white/95 backdrop-blur-xl rounded-3xl shadow-lift p-6 sm:p-8 lx-page">
            <div className="inline-flex items-center gap-2 bg-ink text-white rounded-full pl-1.5 pr-3.5 py-1.5 mb-6">
              <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-serif shrink-0"
                style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}>L</span>
              <span className="text-xs font-medium">Lintel</span>
            </div>
            {needsBootstrap === null ? (
              <p className="text-stone text-sm text-center py-6">Loading&hellip;</p>
            ) : (
              <>
                <h1 className="font-serif text-2xl text-ink mb-1">{heading}</h1>
                <p className="text-stone text-xs mb-6">{subheading}</p>
                {formEl}
                {toggleEl}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


