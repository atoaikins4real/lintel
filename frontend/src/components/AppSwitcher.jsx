import { useEffect } from 'react';
import { IconGrid, IconHome } from './icons.jsx';

// The recent-apps switcher — the Android "square" gesture. A glass overlay with
// one card per open app plus Home; tap a card to jump to it, × to close it.
// Opened from the dock's switcher button or with Ctrl/Cmd+` ; Esc dismisses.
export default function AppSwitcher({ open, openApps, current, titleFor, iconForPath, onOpen, onClose, onHome, onDismiss }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  const go = (p) => { onOpen(p); onDismiss(); };
  const home = () => { onHome(); onDismiss(); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-label="Open apps">
      {/* Scrim — tap to dismiss. */}
      <button type="button" aria-label="Close switcher" onClick={onDismiss}
        className="absolute inset-0 bg-ink/45" style={{ backdropFilter: 'blur(10px)' }} />

      <div className="relative mt-auto mb-24 sm:my-auto w-full px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-sm font-medium text-white/90">Open apps</span>
            <span className="text-[11px] text-white/60 hidden sm:block">Tap to switch · Esc to close</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 snap-x" style={{ scrollbarWidth: 'none' }}>
            {/* Home card */}
            <SwitchCard active={!current} onClick={home}>
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(160deg,#cf9e5c,#a9793a)' }}>
                <IconHome width={20} height={20} />
              </span>
              <span className="text-xs text-ink/85 mt-2">Home</span>
            </SwitchCard>

            {openApps.map((p) => {
              const Icon = iconForPath(p) || IconGrid;
              return (
                <SwitchCard key={p} active={p === current} onClick={() => go(p)} onClose={() => onClose(p)}>
                  <span className="w-11 h-11 rounded-2xl bg-gold/12 text-gold flex items-center justify-center">
                    <Icon width={20} height={20} />
                  </span>
                  <span className="text-xs text-ink/85 mt-2 truncate max-w-[104px]">{titleFor(p)}</span>
                </SwitchCard>
              );
            })}

            {openApps.length === 0 && (
              <div className="text-sm text-white/75 px-2 py-6">Nothing open yet — tap an app on the home screen.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchCard({ active, onClick, onClose, children }) {
  return (
    <div className="relative snap-start shrink-0">
      <button type="button" onClick={onClick}
        className={`w-32 h-32 rounded-3xl flex flex-col items-center justify-center text-center transition
          lx-card ring-1 ${active ? 'ring-gold shadow-lift' : 'ring-white/15 shadow-soft hover:-translate-y-0.5'}`}>
        {children}
      </button>
      {onClose && (
        <button type="button" title="Close" aria-label="Close app" onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-ink text-canvas flex items-center justify-center shadow-lift">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      )}
    </div>
  );
}
