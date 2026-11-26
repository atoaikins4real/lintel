import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchIndex } from '../hooks/useSearchIndex.js';
import { IconSearch, IconArrowRight, IconGrid } from './icons.jsx';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');

// ⌘K / Ctrl-K — the OS-style "jump anywhere". One shortcut to search every app,
// action and record your role has, and go straight there. The index is shared
// with the on-dashboard search, so the two never disagree.
export default function CommandPalette() {
  const navigate = useNavigate();
  const { search } = useSearchIndex();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => search(q), [q, search]);

  const close = useCallback(() => { setOpen(false); setQ(''); setActive(0); }, []);

  // Global ⌘K / Ctrl-K to toggle; "/" opens when not typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); setOpen((o) => !o); return; }
      if (k === 'escape') { setOpen(false); return; }
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
      if (e.key === '/' && !typing && !open) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const run = (c) => { close(); if (c?.to) navigate(c.to); };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        aria-label="Search" title={`Search  (${isMac ? '⌘' : 'Ctrl'} K)`} className="lx-icon-btn">
        <IconSearch width={16} height={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-lg lx-glass rounded-2xl shadow-lift overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 border-b border-line/70">
              <IconSearch width={16} height={16} className="text-stone shrink-0" />
              <input
                ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
                placeholder="Search apps, actions and records…"
                className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder:text-stone outline-none"
              />
              <kbd className="hidden sm:inline text-[10px] text-stone border border-line rounded px-1.5 py-0.5">esc</kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
              {results.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-stone">No matches for “{q}”.</div>
              )}
              {results.map((c, i) => {
                const Icon = c.icon || IconGrid;
                return (
                  <button
                    key={c.kind + c.to + c.label + i} type="button"
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)} onClick={() => run(c)}
                    className={`w-full text-left px-3 mx-1 rounded-xl py-2.5 flex items-center gap-3 transition ${i === active ? 'bg-panel' : 'hover:bg-panel/60'}`}
                    style={{ width: 'calc(100% - 0.5rem)' }}
                  >
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
        </div>
      )}
    </>
  );
}
