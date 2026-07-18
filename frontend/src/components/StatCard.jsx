import { IconTrendUp, IconTrendDown } from './icons.jsx';

export default function StatCard({ label, value, sub, icon: Icon, trend, action }) {
  return (
    <div className="lx-card p-5 sm:p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="lx-eyebrow">{label}</span>
        {Icon && (
          <span className="w-8 h-8 rounded-lg bg-panel text-stone flex items-center justify-center shrink-0">
            <Icon width={15} height={15} />
          </span>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="font-sans font-bold text-[30px] sm:text-[34px] leading-none text-ink tracking-tight">
          {value}
        </div>
        {trend && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full mb-0.5 ${
              trend.direction === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
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
