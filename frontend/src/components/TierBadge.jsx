const DOT = {
  guest: 'bg-stone',
  returning: 'bg-sky-500',
  resident: 'bg-emerald-500',
  exclusive: 'bg-gold',
};

export default function TierBadge({ tier }) {
  return (
    <span className={`pill uppercase tier-${tier}`}>
      <span className={`pill-dot ${DOT[tier] || 'bg-stone'}`} />
      {tier}
    </span>
  );
}
