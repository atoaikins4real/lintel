import { useMemo, useState } from 'react';

/**
 * Client-side search + filtering for list pages.
 *
 * Filtering happens in the browser because these pages already load their
 * full list in one request — adding server round-trips per keystroke would
 * make it feel slower, not faster. If a company ever grows past a few
 * thousand rows this should move server-side with pagination; the shape
 * here keeps that swap contained to one hook.
 */
export function useSearch(items, fields, extraFilter) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const list = items || [];
    const q = query.trim().toLowerCase();

    const searched = !q
      ? list
      : list.filter((item) =>
          fields.some((f) => {
            const value = typeof f === 'function' ? f(item) : item[f];
            return value != null && String(value).toLowerCase().includes(q);
          })
        );

    return extraFilter ? searched.filter(extraFilter) : searched;
  }, [items, query, fields, extraFilter]);

  return { query, setQuery, results };
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/**
 * The one toolbar every list page uses, so search / filters / the primary
 * action line up identically everywhere instead of each page inventing its
 * own arrangement. Layout:
 *
 *   [ search ........ ] [ filter ] [ filter ]        n of N   [ Action ]
 *
 * On phones it stacks to full width, top to bottom, in that order. Pass
 * filters as children (style them `lx-filter`) and the page's primary button
 * as `action`.
 */
export default function SearchBar({ value, onChange, placeholder = 'Search…', count, total, children, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-5">
      <div className="relative flex-1 sm:max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-light pointer-events-none" />
        <input
          className="lx-input pl-9 pr-8"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear"
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone hover:text-ink text-base leading-none"
          >
            ×
          </button>
        )}
      </div>

      {children}

      {/* A quiet count, only while the list is actually being narrowed. */}
      {total !== undefined && count !== total && (
        <span className="text-xs text-stone whitespace-nowrap sm:mr-1">
          {count} of {total}
        </span>
      )}

      {/* Primary action rides in the same toolbar, pinned right on desktop
          and full-width on top on mobile handled by the flex order. */}
      {action && <div className="sm:ml-auto flex flex-col sm:flex-row gap-2 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
