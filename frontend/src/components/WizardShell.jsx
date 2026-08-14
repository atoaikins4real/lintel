// Shared chrome for the onboarding wizards: step chips, error banner and
// footer navigation. Keeps the property and apartment flows consistent
// with each other and with tenant onboarding.
export function StepChips({ steps, step, setStep, unlocked = true }) {
  return (
    <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
      {steps.map((label, i) => (
        <button
          key={label}
          type="button"
          disabled={i > 0 && !unlocked}
          onClick={() => setStep(i)}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
            i === step
              ? 'bg-ink text-white font-medium'
              : i < step
              ? 'bg-gold/10 text-gold'
              : 'bg-panel text-stone-light'
          }`}
        >
          {i + 1}. {label}
        </button>
      ))}
    </div>
  );
}

export function WizardStep({ title, hint, children, onBack, onNext, nextLabel = 'Continue', busy, canNext = true }) {
  return (
    <section className="lx-card p-5 sm:p-6 space-y-4">
      <div>
        <h2 className="font-serif text-lg text-ink">{title}</h2>
        {hint && <p className="text-xs text-stone">{hint}</p>}
      </div>
      {children}
      <div className="flex gap-2 pt-1">
        {onBack && (
          <button type="button" onClick={onBack} className="lx-btn-ghost">
            Back
          </button>
        )}
        <button type="button" onClick={onNext} disabled={busy || !canNext} className="lx-btn-primary">
          {busy ? 'Saving…' : nextLabel}
        </button>
      </div>
    </section>
  );
}

/** Number input with a label — used heavily for layout counts. */
export function NumField({ label, value, onChange, min = 0, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-stone mb-1">{label}</label>
      <input
        type="number" min={min} placeholder={placeholder} className="lx-input"
        value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Select that also accepts a typed value, for finishes that vary locally. */
export function ComboField({ label, value, onChange, options, placeholder = 'Select or type…' }) {
  const listId = `combo-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label className="block text-xs text-stone mb-1">{label}</label>
      <input
        list={listId} placeholder={placeholder} className="lx-input"
        value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

/** Multi-select chip group. */
export function ChipGroup({ label, options, selected, onToggle }) {
  return (
    <div>
      {label && <div className="lx-eyebrow mb-2">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o} type="button" onClick={() => onToggle(o)}
            className={`px-3 py-1.5 rounded-full text-xs border transition ${
              selected.includes(o)
                ? 'border-gold bg-gold/10 text-ink font-medium'
                : 'border-line text-stone hover:border-stone/40'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
