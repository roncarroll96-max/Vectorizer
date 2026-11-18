import { useEffect, useId, useState, type ReactNode } from 'react';
import { isHex } from '../model/color';

interface NumProps {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  /** Visually short label (e.g. "X"); the full label is used for screen readers. */
  short?: string;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Numeric input that commits on Enter/blur and steps with arrow keys (Shift = ×10). */
export function NumField({ label, value, onChange, step = 1, min, max, suffix, disabled, short }: NumProps) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : String(round(value)));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value == null ? '' : String(round(value))); }, [value, focused]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(v)) onChange(clamp(v));
    else setText(value == null ? '' : String(round(value)));
  };
  return (
    <div className={`ed-num${disabled ? ' is-disabled' : ''}`}>
      <label htmlFor={id} title={label}>{short ?? label}<span className="sr-only">{short ? ` (${label})` : ''}</span></label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={value == null ? '—' : undefined}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).select(); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = clamp((Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
            setText(String(round(v)));
            onChange(v);
          }
          if (e.key === 'Escape') { setText(value == null ? '' : String(round(value))); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {suffix && <span className="ed-suffix" aria-hidden="true">{suffix}</span>}
    </div>
  );
}

interface ColorProps {
  label: string;
  value: string;
  onChange: (v: string, live: boolean) => void;
  allowNone?: boolean;
}

/** Color swatch + hex field + "none" toggle. */
export function ColorField({ label, value, onChange, allowNone = true }: ColorProps) {
  const id = useId();
  const none = value === 'none';
  const [hex, setHex] = useState(none ? '' : value);
  const [last, setLast] = useState(none ? '#000000' : value);
  useEffect(() => { if (!none) { setHex(value); setLast(value); } else setHex(''); }, [value, none]);
  const commitHex = (raw: string) => {
    let v = raw.trim().toLowerCase();
    if (!v.startsWith('#')) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v.slice(1).split('').map((c) => c + c).join('')}`;
    if (isHex(v)) onChange(v, false); else setHex(none ? '' : value);
  };
  return (
    <div className="ed-color">
      <span className="ed-color-label" id={`${id}-l`}>{label}</span>
      <input
        type="color"
        aria-labelledby={`${id}-l`}
        value={none ? last : value}
        className={none ? 'is-none' : undefined}
        onChange={(e) => onChange(e.target.value, true)}
      />
      <input
        className="ed-hex"
        aria-label={`${label} hex value`}
        value={hex}
        placeholder={none ? 'none' : ''}
        onChange={(e) => setHex(e.target.value)}
        onBlur={(e) => commitHex(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commitHex((e.target as HTMLInputElement).value); }}
      />
      {allowNone && (
        <button
          type="button"
          className={`ed-none-btn${none ? ' is-active' : ''}`}
          aria-pressed={none}
          aria-label={none ? `Enable ${label.toLowerCase()}` : `No ${label.toLowerCase()}`}
          title={none ? `Enable ${label.toLowerCase()}` : `No ${label.toLowerCase()}`}
          onClick={() => onChange(none ? last : 'none', false)}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" /><path d="M3 13 13 3" stroke="#e5484d" strokeWidth="1.6" /></svg>
        </button>
      )}
    </div>
  );
}

export function PanelSection({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  return (
    <section className="ed-section" aria-labelledby={id}>
      <div className="ed-section-head">
        <h3 id={id}>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function IconButton({ label, onClick, children, disabled, pressed, className }: {
  label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      className={`ed-icon-btn${pressed ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
