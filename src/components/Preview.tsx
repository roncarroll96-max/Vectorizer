import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TraceResult } from '../core/types';
import { Viewport, zoomAround, type View } from './Viewport';
import { IconFit, IconZoomIn, IconZoomOut } from './Icons';

export type ViewMode = 'split' | 'slider';

interface Props {
  originalUrl: string;
  svg: string;
  result: TraceResult | null;
  width: number;
  height: number;
  viewMode: ViewMode;
  showOutlines: boolean;
  picking: boolean;
  onPick: (x: number, y: number) => void;
  busy: boolean;
  stage: string;
  progress: number;
}

const MAX_OVERLAY_NODES = 40000;

const Outlines = memo(function Outlines({ result, scale }: { result: TraceResult; scale: number }) {
  const nodesD = useMemo(() => {
    const parts: string[] = [];
    let count = 0;
    for (const layer of result.layers) {
      const n = layer.nodes;
      for (let i = 0; i < n.length && count < MAX_OVERLAY_NODES; i += 2, count++) {
        parts.push(`M${n[i].toFixed(1)} ${n[i + 1].toFixed(1)}h0`);
      }
    }
    return parts.join('');
  }, [result]);
  const sw = 1.25 / scale;
  return (
    <svg className="outlines" viewBox={`0 0 ${result.width} ${result.height}`} width={result.width} height={result.height} aria-hidden="true">
      {result.layers.map((l, i) => <path key={i} d={l.d} strokeWidth={sw} />)}
      <path className="nodes" d={nodesD} strokeWidth={5 / scale} />
    </svg>
  );
});

const VectorLayer = memo(function VectorLayer({ svg }: { svg: string }) {
  return <div className="vec" dangerouslySetInnerHTML={{ __html: svg }} />;
});

export function Preview(props: Props) {
  const { originalUrl, svg, result, width, height, viewMode, showOutlines, picking, onPick, busy, stage, progress } = props;
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState(50);
  const paneEl = useRef<HTMLDivElement | null>(null);
  const interacted = useRef(false);

  const fit = useCallback(() => {
    const el = paneEl.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / width, r.height / height) * 0.92;
    setView({ scale: s, x: (r.width - width * s) / 2, y: (r.height - height * s) / 2 });
  }, [width, height]);

  const refit = useCallback(() => { interacted.current = false; fit(); }, [fit]);
  useLayoutEffect(() => { refit(); }, [refit, viewMode]);

  useEffect(() => {
    const el = paneEl.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!interacted.current) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, viewMode]);

  const markInteracted = useCallback(() => { interacted.current = true; }, []);
  const zoomBy = (f: number) => {
    const el = paneEl.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    markInteracted();
    setView((v) => zoomAround(v, r.width / 2, r.height / 2, f));
  };

  const pixelated = view.scale >= 3;
  const original = (
    <img
      src={originalUrl}
      width={width}
      height={height}
      alt=""
      draggable={false}
      className={pixelated ? 'pixelated' : undefined}
    />
  );
  const vector = (
    <>
      <div className="checker" />
      {svg && <VectorLayer svg={svg} />}
      {showOutlines && result && <Outlines result={result} scale={view.scale} />}
    </>
  );

  const common = {
    view, setView, width, height, onFit: refit, onInteract: markInteracted,
    viewportRef: (el: HTMLDivElement | null) => { if (el) paneEl.current = el; },
  };

  const sliderRef = useRef<HTMLDivElement>(null);
  const dragDivider = (e: React.PointerEvent) => {
    e.stopPropagation();
    const host = sliderRef.current?.querySelector('.viewport');
    if (!host) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect();
      setSliderPos(Math.round(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)) * 10) / 10);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div className="preview">
      {busy && (
        <div className="progress" role="progressbar" aria-label={`Tracing: ${stage}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="progress-bar" style={{ transform: `scaleX(${Math.max(0.03, progress)})` }} />
          <span className="progress-label">{stage}…</span>
        </div>
      )}

      {viewMode === 'split' ? (
        <div className="split">
          <Viewport {...common} label="Original image" badge="Original" layers={[{ key: 'o', node: original }]} picking={picking} onPick={onPick} />
          <Viewport
            {...common}
            viewportRef={undefined}
            label="Vector result"
            badge="Vector"
            layers={[{ key: 'v', node: vector }]}
            picking={picking}
            onPick={onPick}
          />
        </div>
      ) : (
        <div className="slider-view" ref={sliderRef}>
          <Viewport
            {...common}
            label="Before and after comparison"
            layers={[
              { key: 'o', node: original },
              { key: 'v', node: vector, clip: `inset(0 0 0 ${sliderPos}%)` },
            ]}
            picking={picking}
            onPick={onPick}
          >
            <span className="pane-badge" aria-hidden="true">Original</span>
            <span className="pane-badge right" aria-hidden="true">Vector</span>
            <div className="divider" style={{ left: `${sliderPos}%` }} aria-hidden="true">
              <div className="divider-knob" onPointerDown={dragDivider}>⟷</div>
            </div>
          </Viewport>
          <label className="compare-range">
            <span className="sr-only">Comparison slider position</span>
            <input type="range" min={0} max={100} step={1} value={sliderPos} onChange={(e) => setSliderPos(Number(e.target.value))} aria-valuetext={`${Math.round(sliderPos)}% original`} />
          </label>
        </div>
      )}

      <div className="zoom-controls" role="toolbar" aria-label="Zoom">
        <button type="button" className="icon-btn" onClick={() => zoomBy(0.8)} aria-label="Zoom out"><IconZoomOut /></button>
        <button type="button" className="zoom-level" onClick={() => zoomBy(1 / view.scale)} title="Reset to 100%" aria-label={`Zoom ${Math.round(view.scale * 100)} percent, click for 100 percent`}>
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><IconZoomIn /></button>
        <button type="button" className="icon-btn" onClick={refit} aria-label="Fit to view"><IconFit /></button>
      </div>
      {picking && <div className="pick-hint" role="status">Click the image to pick the background color · <kbd>Esc</kbd> to cancel</div>}
    </div>
  );
}
