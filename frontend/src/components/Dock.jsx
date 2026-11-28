import { IconGrid } from './icons.jsx';

// The taskbar / dock: a start-home button plus a chip for every open app, so you
// can switch between them or close them — the OS metaphor. Fixed to the bottom.
export default function Dock({ openApps, current, titleFor, iconForPath, onHome, onOpen, onClose }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-2 sm:px-4 pb-2 sm:pb-3 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto lx-glass rounded-2xl shadow-lift ring-1 ring-white/20 px-2 py-1.5 flex items-center gap-2"
        style={{ backdropFilter: 'blur(18px) saturate(1.3)' }}>
        <button type="button" onClick={onHome} title="Home" aria-label="Home"
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-serif text-white transition ${current ? '' : 'ring-2 ring-white/50'}`}
          style={{ background: 'linear-gradient(160deg,#cf9e5c,#a9793a)' }}>
          L
        </button>

        <div className="h-7 w-px bg-line/70 shrink-0" />

        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
          {openApps.map((p) => {
            const Icon = iconForPath(p) || IconGrid;
            const active = p === current;
            return (
              <div key={p} role="button" tabIndex={0} onClick={() => onOpen(p)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}
                className={`group flex items-center gap-1.5 rounded-xl pl-2 pr-1 py-1.5 shrink-0 cursor-pointer transition ${active ? 'bg-ink text-canvas' : 'bg-panel/70 text-ink hover:bg-panel'}`}>
                <Icon width={15} height={15} />
                <span className="text-xs max-w-[104px] truncate hidden sm:block">{titleFor(p)}</span>
                <button type="button" title="Close" onClick={(e) => { e.stopPropagation(); onClose(p); }}
                  className={`w-4 h-4 rounded flex items-center justify-center ${active ? 'hover:bg-white/20' : 'hover:bg-ink/10'}`}>
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                </button>
              </div>
            );
          })}
          {openApps.length === 0 && (
            <span className="text-[11px] text-stone px-2 truncate">No apps open — tap an icon on the desktop.</span>
          )}
        </div>
      </div>
    </div>
  );
}
