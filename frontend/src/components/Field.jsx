// A labelled form field. We prefer a visible label over a placeholder hint:
// placeholders vanish the moment someone types (so they can't check what a
// field was for), and they read as filler. Field puts a persistent label
// above the control and leaves the control itself to the caller, so it works
// for inputs, selects, textareas and custom widgets alike.
//
//   <Field label="Email" required>
//     <input className="lx-input" value={email} onChange={...} />
//   </Field>
//
// For the common plain-input case, <TextField/> below saves the wrapping.

export default function Field({ label, required, hint, htmlFor, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="lx-label">
          {label}
          {required && <span className="text-gold"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-stone mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

// Convenience wrapper for a plain text/email/number/etc. input with a label.
// Any extra props (value, onChange, type, required, min, disabled…) pass
// straight through to the <input>.
export function TextField({ label, required, hint, className = '', inputClassName = 'lx-input', ...inputProps }) {
  return (
    <Field label={label} required={required} hint={hint} className={className}>
      <input className={inputClassName} required={required} {...inputProps} />
    </Field>
  );
}
