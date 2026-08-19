// Shared money display and currency input.
//
// The rule these components exist to enforce: a figure spanning more than
// one currency is shown as a breakdown, and any converted roll-up is
// visibly labelled an estimate. A number that silently mixes currencies
// looks exactly like a correct one, which is what makes it dangerous.
import { CURRENCY_CODES, CURRENCY_LABELS, formatMoney, formatMoneyBreakdown, isMixed } from '../utils/currency.js';

/**
 * A total that may span several currencies.
 *
 * Shows the per-currency breakdown as the primary figure. When more than
 * one currency is present it adds the converted estimate underneath, and
 * if any currency had no configured rate it says so rather than quietly
 * leaving that money out of the estimate.
 */
export function MoneyTotal({ byCurrency, indicative, label, className = '' }) {
  const mixed = isMixed(byCurrency);
  const missing = indicative?.missing || [];

  return (
    <div className={className}>
      {label && <div className="lx-eyebrow mb-1">{label}</div>}
      <div className="font-serif text-xl text-ink leading-tight">
        {formatMoneyBreakdown(byCurrency)}
      </div>

      {mixed && indicative && (
        <div className="text-[11px] text-stone mt-1 leading-snug">
          {missing.length === 0 ? (
            <>≈ {formatMoney(indicative.amount, indicative.currency)} estimated at your rates</>
          ) : (
            <span className="text-amber-700">
              Estimate unavailable — no exchange rate set for {missing.join(', ')}.{' '}
              <span className="text-stone">Add one in Settings.</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Currency picker. The blank option means "inherit", which is a real
 * value here rather than an absence — a unit with no currency of its own
 * follows its property, and a property follows the company default. That
 * is why the placeholder names what will be inherited instead of saying
 * "none".
 */
export function CurrencyField({
  label = 'Currency',
  value,
  onChange,
  inheritedFrom,
  inheritedValue,
  allowInherit = true,
  disabled = false,
  className = '',
}) {
  return (
    <label className={`block ${className}`}>
      <span className="lx-label">{label}</span>
      <select
        className="lx-input"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {allowInherit && (
          <option value="">
            {inheritedValue
              ? `Use ${inheritedFrom || 'default'} (${inheritedValue})`
              : `Use ${inheritedFrom || 'default'}`}
          </option>
        )}
        {CURRENCY_CODES.map((code) => (
          <option key={code} value={code}>
            {CURRENCY_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default MoneyTotal;
