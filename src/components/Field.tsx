import { useId, type CSSProperties, type ReactNode } from 'react';

interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  disabled?: boolean;
}

export function RangeField({ label, value, min, max, step = 1, onChange, format, hint, disabled }: RangeProps) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={`field range-field${disabled ? ' is-disabled' : ''}`}>
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="field-value">{shown}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={shown}
        aria-describedby={hint ? `${id}-hint` : undefined}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

export function ToggleField({ label, checked, onChange, hint, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className={`field toggle-field${disabled ? ' is-disabled' : ''}`}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="field select-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  hideLabel?: boolean;
  className?: string;
}

/** Radio group styled as a segmented control (native radios ⇒ arrow-key navigation for free). */
export function Segmented<T extends string>({ label, value, options, onChange, hideLabel, className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className={`segmented${className ? ` ${className}` : ''}`}>
      <legend className={hideLabel ? 'sr-only' : undefined}>{label}</legend>
      <div className="segmented-track">
        {options.map((o) => (
          <label key={o.value} className={value === o.value ? 'is-active' : undefined} title={o.title}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <section className="panel-section" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
