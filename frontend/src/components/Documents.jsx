import { useEffect, useRef, useState } from 'react';
import { getDocuments, uploadDocument, getDocumentUrl, deleteDocument, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import RowActions from './RowActions.jsx';

const KINDS = [
  { value: 'lease_agreement', label: 'Lease agreement' },
  { value: 'id_document', label: 'ID document' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'inspection', label: 'Inspection report' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
];

const humanSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Attach and view documents for one record. `owner` is e.g.
 * { lease_id: '…' } or { tenant_id: '…' }.
 *
 * Files live in a private bucket — unlike unit photos, a signed tenancy
 * agreement shouldn't be readable by anyone holding the URL. Downloads
 * therefore fetch a short-lived signed link at click time rather than
 * storing a permanent one.
 */
export default function Documents({ owner, defaultKind = 'other', title = 'Documents' }) {
  const { canEdit, isManager } = useAuth();
  const inputRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [kind, setKind] = useState(defaultKind);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    getDocuments(owner)
      .then(setDocs)
      .catch((err) => setError(readApiError(err, 'load documents')));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(owner)]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError('');
    setBusy(true);

    for (const file of files) {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Could not read that file.'));
          reader.onload = () => resolve(String(reader.result).split(',').pop());
          reader.readAsDataURL(file);
        });

        await uploadDocument({
          ...owner,
          data: base64,
          filename: file.name,
          mime_type: file.type,
          title: file.name,
          kind,
        });
      } catch (err) {
        setError(err?.response ? readApiError(err, 'upload that file') : err.message);
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  // Signed URLs are minted per click and expire quickly, so they're
  // fetched here rather than held in state.
  const open = async (id) => {
    setError('');
    setBusyId(id);
    try {
      const { url } = await getDocumentUrl(id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(readApiError(err, 'open that document'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteDocument(id);
      load();
    } catch (err) {
      setError(readApiError(err, 'delete that document'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="lx-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="font-serif text-lg text-ink">{title}</div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select className="lx-select !py-1.5 text-xs w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input
              ref={inputRef} type="file" multiple onChange={handleFiles} className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            />
            <button
              type="button" disabled={busy} onClick={() => inputRef.current?.click()}
              className="lx-btn-ghost text-xs px-3 py-1.5"
            >
              {busy ? 'Uploading…' : 'Attach file ↑'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-700 mb-2">{error}</p>}

      <ul className="divide-y divide-line/70">
        {docs.map((d) => (
          <li key={d.id} className="py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <button
                type="button" onClick={() => open(d.id)} disabled={busyId === d.id}
                className="text-sm text-ink hover:text-gold text-left truncate block"
              >
                {busyId === d.id ? 'Opening…' : d.title}
              </button>
              <div className="text-xs text-stone">
                {KINDS.find((k) => k.value === d.kind)?.label || d.kind}
                {d.size_bytes ? ` · ${humanSize(d.size_bytes)}` : ''}
                {` · ${new Date(d.created_at).toLocaleDateString()}`}
              </div>
            </div>
            {isManager && (
              <RowActions onDelete={() => remove(d.id)} busy={busyId === d.id} deleteLabel="Delete this document?" />
            )}
          </li>
        ))}
        {docs.length === 0 && (
          <li className="py-3 text-sm text-stone">
            No documents attached yet{canEdit ? ' — use “Attach file” above.' : '.'}
          </li>
        )}
      </ul>
    </div>
  );
}
