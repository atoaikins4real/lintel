import { useState } from 'react';

// Slim, bright top bar for the public showcase + property pages. Shows the
// company's identity and a Share button that copies the current URL — the
// whole point of a "shareable link". Kept deliberately simple and neutral so
// it reads as the subscriber's own mini-site, not the Lintel app.
export default function PublicHeader({ company, backTo, backLabel }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: company?.name || 'Property', url });
        return;
      }
    } catch {
      /* user dismissed the share sheet — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — nothing else we can safely do */
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <a href={backTo || '#'} className="flex items-center gap-2.5 min-w-0">
          {company?.logo_url ? (
            <img src={company.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-serif shrink-0"
              style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}>
              {company?.name?.[0]?.toUpperCase() || 'L'}
            </span>
          )}
          <span className="font-serif text-lg text-ink truncate">{company?.name || 'Listings'}</span>
        </a>

        <div className="flex items-center gap-2 shrink-0">
          {backTo && backLabel && (
            <a href={backTo} className="hidden sm:inline text-sm text-stone hover:text-ink px-3 py-2">{backLabel}</a>
          )}
          {(company?.phone || company?.email) && (
            <a href={company.phone ? `tel:${company.phone}` : `mailto:${company.email}`}
              className="hidden sm:inline text-sm text-stone hover:text-ink px-3 py-2">
              {company.phone || company.email}
            </a>
          )}
          <button type="button" onClick={share}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-panel transition">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
              <path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6" />
            </svg>
            {copied ? 'Link copied' : 'Share'}
          </button>
        </div>
      </div>
    </header>
  );
}
