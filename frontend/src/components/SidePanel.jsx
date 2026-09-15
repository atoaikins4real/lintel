// Grouped filter/navigation panel — the left column of the master-detail
// layout (see the reference dashboard). Each group has an uppercase label and
// a list of selectable items with an optional count badge and active state.
//
// Presentational only: the page owns selection semantics (usually single-
// select per group). On desktop it's a sticky left card; on mobile each
// group's items become a horizontally-scrollable chip row.
export default function SidePanel({ title, groups }) {
  return (
    <aside className="lx-card p-3 lg:p-3.5 lg:sticky lg:top-24 self-start">
      {title && <div className="px-2 pt-1 pb-2 font-serif text-base text-ink">{title}</div>}
      <div className="space-y-4">
        {groups.filter(Boolean).map((group) => (
          <div key={group.label}>
            <div className="lx-eyebrow px-2 mb-1.5">{group.label}</div>
            <div className="flex lg:flex-col gap-1.5 lg:gap-0.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1">
              {group.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={it.onClick}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap shrink-0 lg:w-full transition ${
                    it.active
                      ? 'bg-panel text-ink font-medium'
                      : 'text-stone hover:text-ink hover:bg-panel/60'
                  }`}
                >
                  {it.icon && <it.icon width={15} height={15} className="shrink-0" />}
                  <span className="truncate">{it.label}</span>
                  {it.count != null && (
                    <span
                      className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-md ${
                        it.active ? 'bg-gold/15 text-gold' : 'bg-stone/10 text-stone'
                      }`}
                    >
                      {it.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
