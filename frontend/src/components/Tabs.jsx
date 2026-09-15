// Underline tab bar. Controlled: pass tabs [{key,label,count?}], the active
// key, and onChange. Scrolls horizontally if it overflows on small screens.
export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="border-b border-line/70 -mx-1 px-1 overflow-x-auto">
      <div className="flex items-center gap-5 min-w-max">
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={`relative py-2.5 text-sm font-medium whitespace-nowrap transition ${
                active ? 'text-ink' : 'text-stone hover:text-ink'
              }`}
            >
              {t.label}
              {t.count != null && (
                <span className={`ml-1.5 text-xs ${active ? 'text-gold' : 'text-stone-light'}`}>{t.count}</span>
              )}
              {active && <span className="absolute left-0 -bottom-px h-0.5 w-full rounded-full bg-gold" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
