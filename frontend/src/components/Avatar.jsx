// Initials avatar for list rows. Neutral by default (panel + ink) to stay
// within the ink/gold theme; pass tone="gold" for an accented one.
function initialsFrom(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
};

export default function Avatar({ name, label, size = 'md', tone = 'neutral', className = '' }) {
  const text = label || initialsFrom(name);
  const tones = {
    neutral: 'bg-panel border border-line text-ink',
    gold: 'bg-gold/12 border border-gold/25 text-gold',
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${SIZES[size]} ${tones[tone] || tones.neutral} ${className}`}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
