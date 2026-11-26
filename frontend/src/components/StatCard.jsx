import { IconTrendUp, IconTrendDown } from './icons.jsx';

// A single KPI card: eyebrow label, icon chip, big bold number, optional
// semantic delta pill (green up / red down) and a sub line. Icon chip is
// gold-tinted by default; pass tone="neutral" for a quieter one. Colour is
// only ever used semantically (the delta pill), keeping the ink/gold theme.
const TONES = {
  gold: 'bg-gold/12 text-gold',
  neutral: 'bg-panel text-stone',
};

export default function StatCard({ label, value, sub, icon: Icon, trend, action, tone = 'gold' }) {
  return (
    <div className="lx-card p-4 sm:p-5 flex flex-col gap-2.5 lx-lift">
      <div className="flex items-start justify-between">
        <span className="lx-eyebrow">{label}</span>
        {Icon && (
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone] || TONES.gold}`}>
            <Icon width={15} height={15} />
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="font-sans font-bold text-[28px] sm:text-[32px] leading-none text-ink tracking-tight">
          {value}
        </div>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full mb-0.5 ${
              trend.direction === 'down' ? 'pill-danger' : 'pill-ok'
            }`}
          >
            {trend.direction === 'down' ? <IconTrendDown width={11} height={11} /> : <IconTrendUp width={11} height={11} />}
            {trend.value}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between min-h-[18px]">
        {sub && <span className="text-xs text-stone">{sub}</span>}
        {action && (
          <span className="text-xs font-medium text-ink/70 hover:text-gold transition inline-flex items-center gap-1 cursor-pointer">
            {action}
          </span>
        )}
      </div>
    </div>
  );
}
