import { Link } from 'react-router-dom';

// Friendly empty state for list pages — a soft icon, a plain-language line
// and, where it helps, a clear next-step button. So a new subscriber never
// lands on a blank screen wondering what to do.
export default function EmptyState({ icon: Icon, title, description, actionLabel, actionTo, onAction }) {
  return (
    <div className="lx-card p-8 sm:p-10 text-center flex flex-col items-center">
      {Icon && (
        <span className="w-12 h-12 rounded-2xl bg-gold/12 text-gold flex items-center justify-center mb-4">
          <Icon width={22} height={22} />
        </span>
      )}
      <div className="font-serif text-lg text-ink mb-1">{title}</div>
      {description && <p className="text-sm text-stone max-w-sm mb-5">{description}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="lx-btn-primary">{actionLabel}</Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" onClick={onAction} className="lx-btn-primary">{actionLabel}</button>
      )}
    </div>
  );
}
