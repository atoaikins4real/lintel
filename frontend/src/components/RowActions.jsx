import { useState } from 'react';

// Edit / Delete controls used on every list page, so the interaction is
// identical everywhere. Delete asks for confirmation inline rather than
// with a browser confirm() — the latter is easy to dismiss by reflex, and
// these actions remove real business records.
export default function RowActions({ onEdit, onDelete, busy, editing, deleteLabel = 'Delete this record?' }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-rose-700">{deleteLabel}</span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            await onDelete();
            setConfirming(false);
          }}
          className="text-xs px-2.5 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? 'Removing…' : 'Yes, delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-stone hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-xs text-stone hover:text-ink px-2 py-1">
          {editing ? 'Close' : 'Edit'}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs text-stone hover:text-rose-700 px-2 py-1"
        >
          Delete
        </button>
      )}
    </div>
  );
}
