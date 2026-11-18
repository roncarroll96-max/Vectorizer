import type { Layer, Mode } from '../core/types';
import type { LayerOverride } from '../core/svg';
import { IconEye, IconEyeOff } from './Icons';

interface Props {
  mode: Mode;
  layers: Layer[];
  overrides: Record<string, LayerOverride>;
  onChange: (color: string, o: LayerOverride | null) => void;
  onReset: () => void;
}

export function Palette({ mode, layers, overrides, onChange, onReset }: Props) {
  if (!layers.length) return <p className="muted small">The palette appears after tracing.</p>;
  const total = layers.reduce((a, l) => a + l.pixelCount, 0) || 1;
  const touched = Object.keys(overrides).length > 0;
  return (
    <div className="palette">
      <ul className="swatches" aria-label="Layers, back to front">
        {layers.map((l, i) => {
          const o = overrides[l.color] ?? {};
          const color = o.color ?? l.color;
          const pct = (l.pixelCount / total) * 100;
          const name = mode === 'lineart' ? 'Stroke' : mode === 'bw' ? (i === 0 ? 'Background' : 'Ink') : `Layer ${i + 1}`;
          return (
            <li key={l.color + i} className={`swatch${o.hidden ? ' is-hidden' : ''}`}>
              <input
                type="color"
                value={color}
                aria-label={`Recolor ${name} (currently ${color})`}
                title={`${name}: ${color} · ${pct.toFixed(1)}% of pixels — click to recolor`}
                onChange={(e) => onChange(l.color, { ...o, color: e.target.value })}
              />
              <button
                type="button"
                className="swatch-toggle"
                aria-pressed={!!o.hidden}
                aria-label={o.hidden ? `Show ${name}` : `Remove ${name}`}
                title={o.hidden ? 'Show layer' : 'Remove layer'}
                onClick={() => onChange(l.color, { ...o, hidden: !o.hidden })}
              >
                {o.hidden ? <IconEyeOff width={14} height={14} /> : <IconEye width={14} height={14} />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="field-hint">
        Click a swatch to recolor. Removing a layer lets the layer beneath show through.
        {touched && <> <button type="button" className="link-btn" onClick={onReset}>Reset palette</button></>}
      </p>
    </div>
  );
}
