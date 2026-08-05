import { useState } from 'react';

// Lightweight carousel — no new npm dependency. Used on both the public
// showcase grid (small, no controls needed at a glance) and the per-unit
// detail page (full controls). Safe to nest inside a <Link> — button
// clicks stop propagation so they don't trigger navigation.
export default function Slideshow({ photos, alt, heightClass = 'h-48' }) {
  const [index, setIndex] = useState(0);
  const images = photos && photos.length ? photos : [];

  if (!images.length) {
    return <div className={`${heightClass} w-full bg-gradient-to-br from-ink to-ink-soft`} />;
  }

  const go = (e, delta) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + delta + images.length) % images.length);
  };

  return (
    <div className={`relative ${heightClass} w-full overflow-hidden group`}>
      <img src={images[index]} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ink/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-lg leading-none"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ink/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-lg leading-none"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
