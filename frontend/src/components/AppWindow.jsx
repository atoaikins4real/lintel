import { IconGrid } from './icons.jsx';

// An open app, presented as a window over the desktop: a title bar with the app
// name and the usual window controls — minimize (back to desktop, stays open on
// the dock), maximize/restore (wider), and close.
export default function AppWindow({ title, Icon, maximized, onMinimize, onToggleMax, onClose, children }) {
  const I = Icon || IconGrid;
  return (
    <div className={`mx-auto px-3 sm:px-5 pt-4 sm:pt-5 transition-[max-width] duration-200 ${maximized ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
      <div className="lx-card rounded-[22px] shadow-lift overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-line/70 bg-panel/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0"><I width={16} height={16} /></span>
            <span className="font-serif text-base sm:text-lg text-ink truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <WinBtn label="Minimize" onClick={onMinimize} hover="hover:bg-amber-400/25 hover:text-amber-600">
              <svg width="11" height="11" viewBox="0 0 12 12"><rect x="2" y="8.8" width="8" height="1.4" rx="0.7" fill="currentColor" /></svg>
            </WinBtn>
            <WinBtn label={maximized ? 'Restore' : 'Maximize'} onClick={onToggleMax} hover="hover:bg-emerald-400/25 hover:text-emerald-600">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.2" /></svg>
            </WinBtn>
            <WinBtn label="Close" onClick={onClose} hover="hover:bg-rose-500/20 hover:text-rose-600">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" /></svg>
            </WinBtn>
          </div>
        </div>
        <div key={title} className="lx-page p-4 sm:p-6 lg:p-7">{children}</div>
      </div>
    </div>
  );
}

function WinBtn({ label, onClick, hover = '', children }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-stone transition ${hover}`}>
      {children}
    </button>
  );
}
