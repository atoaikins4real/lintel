import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { quickAddActions } from '../config/apps.js';
import { IconPlus } from './icons.jsx';

// Global "+" — create anything your role allows, from any screen. Which actions
// appear is decided by the role (what you manage) and gated by the worker's
// permissions, so a housekeeper never sees "Record a payment".
export default function QuickAdd() {
  const { role, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const actions = quickAddActions(role).filter((a) => !a.perm || can(a.perm));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  // A member with no create rights gets no + button at all.
  if (!actions.length) return null;

  const go = (to) => { setOpen(false); navigate(to); };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-label="Create" title="Create" aria-expanded={open}
        className="lx-icon-btn bg-gold text-white hover:bg-gold/90 border-transparent">
        <IconPlus width={16} height={16} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-2rem)] z-50 lx-glass rounded-2xl shadow-lift overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line/70 lx-eyebrow text-stone">Create</div>
          <ul className="py-1">
            {actions.map((a) => (
              <li key={a.to + a.label}>
                <button type="button" onClick={() => go(a.to)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-panel/70 transition">
                  <span className="w-8 h-8 rounded-lg bg-gold/12 text-gold flex items-center justify-center shrink-0">
                    <a.icon width={16} height={16} />
                  </span>
                  <span className="text-sm font-medium text-ink">{a.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
