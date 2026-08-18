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

export default function SearchBar({ value, onChange, placeholder = 'Search…', count, total, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div className="relative flex-1 sm:max-w-xs">
        <input
          className="lx-input pr-8"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone hover:text-ink text-sm"
          >
            ×
          </button>
        )}
      </div>

      {children}

      {/* Only show a count once something is actually narrowing the list,
          so the UI stays quiet in the common case. */}
      {total !== undefined && count !== total && (
        <span className="text-xs text-stone whitespace-nowrap">
          {count} of {total}
        </span>
      )}
    </div>
  );
}
