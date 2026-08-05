import { useRef, useState } from 'react';
import { uploadPhoto, readApiError } from '../api/client.js';
import { resizeImage } from '../utils/image.js';

// "Upload from device" control used by both gallery pickers (the new-unit
// form and the unit detail page). Handles multi-select, resizes each image
// client-side, uploads them one at a time, and reports partial failures
// rather than silently dropping them.
export default function PhotoUploader({ onUploaded, label = 'Upload from device' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setError('');
    setBusy(true);
    const uploaded = [];
    const failed = [];

    for (let i = 0; i < files.length; i++) {
      setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading…');
      try {
        const { data, contentType } = await resizeImage(files[i]);
        const { url } = await uploadPhoto({ data, contentType });
        uploaded.push(url);
      } catch (err) {
        failed.push(files[i].name || 'image');
        setError(err?.response ? readApiError(err, 'upload that photo') : err.message);
      }
    }

    if (uploaded.length) onUploaded(uploaded);
    if (failed.length) {
      setError((prev) => prev || `Couldn't upload: ${failed.join(', ')}`);
    }

    setBusy(false);
    setProgress('');
    // Reset so picking the same file again still fires onChange.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
        id="photo-upload-input"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="lx-btn-ghost text-xs px-3 py-1.5"
      >
        {busy ? progress || 'Uploading…' : `${label} ↑`}
      </button>
      {error && <p className="text-xs text-rose-700 mt-1.5">{error}</p>}
    </div>
  );
}
