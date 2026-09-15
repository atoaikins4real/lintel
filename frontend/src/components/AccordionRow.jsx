import { IconChevron } from './icons.jsx';

// Collapsible list row: a always-legible summary header (title + badges +
// a right-side meta) that expands to reveal full details and actions.
// Used across the Operations lists so long lists stay scannable.
export default function AccordionRow({ open, onToggle, title, badges, meta, children }) {
  return (
    <div className="lx-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-panel/60 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink text-sm truncate">{title}</span>
            {badges}
          </div>
        </div>
        {meta && <div className="text-xs text-stone shrink-0 text-right">{meta}</div>}
        <IconChevron
          width={16}
          height={16}
          className={`shrink-0 text-stone transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-3 border-t border-line/70 space-y-2">{children}</div>}
    </div>
  );
}
