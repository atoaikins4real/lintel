import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSearchIndex } from '../hooks/useSearchIndex.js';
import { RECORD_SOURCES } from '../config/apps.js';
import { IconSearch, IconArrowRight, IconGrid } from './icons.jsx';

// A front-and-centre search on the dashboard — type a guest, room, listing,
// payment page or any action and jump straight there. Same index as ⌘K.
export default function DashboardSearch() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { search } = useSearchIndex();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const results = useMemo(() => (q.trim() ? search(q) : []), [q, search]);

  const placeholder = useMemo(() => {
    const words = (RECORD_SOURCES[role] || []).map((s) => s.kind.toLowerCase() + 's');
    return words.length ? `Search ${words.join(', ')} or jump to anything…` : 'Search anything…';
  }, [role]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => { setActive(0); }, [q]);

  const go = (c) => { if (!c?.to) return; setOpen(false); setQ(''); navigate(c.to); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="lx-card shadow-lift flex items-center gap-3 px-4 py-3">
        <IconSearch width={18} height={18} className="text-stone shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q.trim() && setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm sm:text-base text-ink placeholder:text-stone outline-none min-w-0"
          aria-label="Search your workspace"
        />
        <kbd className="hidden sm:inline text-[10px] text-stone border border-line rounded px-1.5 py-0.5 shrink-0">⌘K</kbd>
      </div>

      {open && q.trim() && (
        <div className="absolute left-0 right-0 mt-2 z-50 lx-glass rounded-2xl shadow-lift overflow-hidden">
          <div className="max-h-[56vh] overflow-y-auto py-1">
            {results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-stone">No matches for “{q}”.</div>
            )}
            {results.map((c, i) => {
              const Icon = c.icon || IconGrid;
              return (
                <button key={c.kind + c.to + c.label + i} type="button"
                  onMouseEnter={() => setActive(i)} onClick={() => go(c)}
                  className={`w-full text-left px-3 mx-1 rounded-xl py-2.5 flex items-center gap-3 transition ${i === active ? 'bg-panel' : 'hover:bg-panel/60'}`}
                  style={{ width: 'calc(100% - 0.5rem)' }}>
                  <span className="w-8 h-8 rounded-lg bg-gold/12 text-gold flex items-center justify-center shrink-0">
                    <Icon width={16} height={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{c.label}</span>
                    {c.hint && <span className="block text-xs text-stone truncate">{c.hint}</span>}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-stone shrink-0">{c.kind}</span>
                  <IconArrowRight width={14} height={14} className="text-stone shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
