import type { Mode, Settings } from '../core/types';
import { PRESETS } from '../core/presets';
import { RangeField, Section, Segmented, SelectField, ToggleField } from './Field';
import { IconPipette, IconReset } from './Icons';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onPreset: (id: string) => void;
  activePreset: string | null;
  onReset: () => void;
  picking: boolean;
  onTogglePick: () => void;
  detectedBackground: string | null;
  thresholdUsed: number | null;
  canDownscale: boolean;
  processingLabel: string;
  separateShapes: boolean;
  onSeparateShapes: (v: boolean) => void;
}

const MODES: { value: Mode; label: string; title: string }[] = [
  { value: 'bw', label: 'B & W', title: 'Threshold, then trace outlines' },
  { value: 'color', label: 'Color', title: 'Quantize to N colors and trace each layer' },
  { value: 'lineart', label: 'Line art', title: 'Centerline strokes for sketches' },
];

export function Controls(props: Props) {
  const { settings: s, onChange, onPreset, activePreset, onReset, picking, onTogglePick, detectedBackground, thresholdUsed, canDownscale, processingLabel, separateShapes, onSeparateShapes } = props;
  const px = (v: number) => `${v.toFixed(1)} px`;
  const bgShown = s.bgColor ?? detectedBackground;

  return (
    <>
      <Section
        title="Presets"
        aside={<button type="button" className="btn btn-sm btn-ghost" onClick={onReset}><IconReset width={14} height={14} /> Reset</button>}
      >
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`preset${activePreset === p.id ? ' is-active' : ''}`}
              aria-pressed={activePreset === p.id}
              onClick={() => onPreset(p.id)}
            >
              <strong>{p.label}</strong>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Mode">
        <Segmented label="Tracing mode" hideLabel value={s.mode} options={MODES} onChange={(mode) => onChange({ mode })} />
        {s.mode === 'color' && (
          <>
            <RangeField label="Colors" min={2} max={64} value={s.colors} onChange={(colors) => onChange({ colors })} />
            <SelectField
              label="Quantizer"
              value={s.quantizer}
              options={[{ value: 'kmeans', label: 'k-means++ (best quality)' }, { value: 'mediancut', label: 'Median cut (faster)' }]}
              onChange={(quantizer) => onChange({ quantizer })}
            />
          </>
        )}
        {s.mode !== 'color' && (
          <>
            <ToggleField
              label="Automatic threshold (Otsu)"
              checked={s.thresholdAuto}
              onChange={(thresholdAuto) => onChange(thresholdAuto ? { thresholdAuto } : { thresholdAuto, threshold: thresholdUsed ?? s.threshold })}
            />
            <RangeField
              label="Threshold"
              min={1}
              max={255}
              value={s.thresholdAuto ? (thresholdUsed ?? s.threshold) : s.threshold}
              disabled={s.thresholdAuto}
              onChange={(threshold) => onChange({ threshold })}
              hint="Pixels darker than this become ink."
            />
            <ToggleField label="Invert (trace light on dark)" checked={s.invert} onChange={(invert) => onChange({ invert })} />
          </>
        )}
      </Section>

      <Section title="Tracing">
        <RangeField label="Simplify" min={0} max={5} step={0.1} value={s.simplify} format={px} onChange={(simplify) => onChange({ simplify })} hint="Higher = fewer nodes, less detail." />
        <RangeField label="Smoothness" min={0} max={5} step={0.1} value={s.smoothness} format={(v) => (v === 0 ? 'Polygons' : px(v))} onChange={(smoothness) => onChange({ smoothness })} hint="Bézier fitting tolerance. 0 keeps straight segments." />
        <RangeField label="Corner angle" min={0} max={180} value={s.cornerAngle} format={(v) => `${v}°`} onChange={(cornerAngle) => onChange({ cornerAngle })} hint="Turns sharper than this stay as corners." />
        <RangeField label="Minimum speck size" min={0} max={500} value={s.minSpeck} format={(v) => `${v} px²`} onChange={(minSpeck) => onChange({ minSpeck })} />
      </Section>

      <Section title="Preprocess">
        <RangeField label="Blur" min={0} max={5} value={s.blur} format={(v) => (v ? `${v} px` : 'Off')} onChange={(blur) => onChange({ blur })} />
        <ToggleField label="Denoise (median filter)" checked={s.denoise} onChange={(denoise) => onChange({ denoise })} />
        <RangeField label="Contrast" min={-100} max={100} value={s.contrast} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={(contrast) => onChange({ contrast })} />
      </Section>

      <Section title="Background">
        <ToggleField label="Remove background (transparent)" checked={s.bgRemove} onChange={(bgRemove) => onChange({ bgRemove })} />
        <div className={`bg-picker${s.bgRemove ? '' : ' is-disabled'}`}>
          <span className="bg-chip" style={{ background: bgShown ?? 'transparent' }} aria-hidden="true" />
          <span className="bg-label">{s.bgColor ? `Picked ${s.bgColor}` : detectedBackground ? `Auto: ${detectedBackground}` : 'Auto-detect from edges'}</span>
          <button type="button" className={`btn btn-sm${picking ? ' is-active' : ''}`} aria-pressed={picking} onClick={onTogglePick} disabled={!s.bgRemove}>
            <IconPipette width={14} height={14} /> {picking ? 'Picking…' : 'Pick'}
          </button>
          {s.bgColor && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange({ bgColor: null })} disabled={!s.bgRemove}>Auto</button>}
        </div>
        <RangeField label="Tolerance" min={0} max={160} value={s.bgTolerance} disabled={!s.bgRemove} onChange={(bgTolerance) => onChange({ bgTolerance })} />
        <ToggleField label="Only connected to edges" checked={s.bgContiguous} disabled={!s.bgRemove} onChange={(bgContiguous) => onChange({ bgContiguous })} />
      </Section>

      <Section title="Output">
        <Segmented
          label="Coordinate precision"
          value={String(s.precision) as '1' | '2'}
          options={[{ value: '1', label: '1 decimal' }, { value: '2', label: '2 decimals' }]}
          onChange={(v) => onChange({ precision: Number(v) as 1 | 2 })}
        />
        <ToggleField
          label="Separate shapes"
          checked={separateShapes}
          onChange={onSeparateShapes}
          hint={separateShapes
            ? 'Each connected shape is its own path, grouped by color. Holes stay with their shape.'
            : 'One compound path per color: the smallest file.'}
        />
        {canDownscale && (
          <ToggleField
            label="Process at full resolution"
            checked={s.fullResolution}
            onChange={(fullResolution) => onChange({ fullResolution })}
            hint={`${processingLabel}. Full resolution is slower but keeps fine detail.`}
          />
        )}
      </Section>
    </>
  );
}
