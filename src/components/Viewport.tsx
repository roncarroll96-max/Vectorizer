import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 64;

export function zoomAround(v: View, px: number, py: number, factor: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const k = scale / v.scale;
  return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

export interface ViewportLayer {
  key: string;
  node: ReactNode;
  /** CSS clip-path applied in viewport space (used by the before/after slider). */
  clip?: string;
}

interface Props {
  label: string;
  badge?: string;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  width: number;
  height: number;
  layers: ViewportLayer[];
  onFit: () => void;
  onInteract?: () => void;
  picking?: boolean;
  onPick?: (x: number, y: number) => void;
  className?: string;
  children?: ReactNode;
  viewportRef?: (el: HTMLDivElement | null) => void;
}

/**
 * A pannable / zoomable surface. The view transform is owned by the parent so
 * several viewports can stay perfectly in sync. Supports mouse drag, wheel
 * zoom around the cursor, two-finger pinch, and keyboard (arrows, + − 0 1).
 */
export function Viewport({
  label, badge, view, setView, width, height, layers, onFit, onInteract, picking, onPick, className, children, viewportRef,
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, downX: 0, downY: 0 });

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
      onInteract?.();
      setView((v) => zoomAround(v, e.clientX - r.left, e.clientY - r.top, factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView, onInteract]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false, downX: e.clientX, downY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!gesture.current.moved && Math.hypot(e.clientX - gesture.current.downX, e.clientY - gesture.current.downY) < 4) return;
      gesture.current.moved = true;
      onInteract?.();
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
      const r = e.currentTarget.getBoundingClientRect();
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const m0 = { x: (prev.x + other.x) / 2 - r.left, y: (prev.y + other.y) / 2 - r.top };
      const m1 = { x: (e.clientX + other.x) / 2 - r.left, y: (e.clientY + other.y) / 2 - r.top };
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture.current.moved = true;
      onInteract?.();
      setView((v) => {
        const z = zoomAround(v, m0.x, m0.y, d0 > 0 ? d1 / d0 : 1);
        return { ...z, x: z.x + m1.x - m0.x, y: z.y + m1.y - m0.y };
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had || pointers.current.size > 0) return;
    if (!gesture.current.moved && picking && onPick) {
      const r = e.currentTarget.getBoundingClientRect();
      const v = viewRef.current;
      const ix = (e.clientX - r.left - v.x) / v.scale;
      const iy = (e.clientY - r.top - v.y) / v.scale;
      if (ix >= 0 && iy >= 0 && ix < width && iy < height) onPick(Math.floor(ix), Math.floor(iy));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = elRef.current;
    if (!el || e.target !== el) return;
    const step = e.shiftKey ? 200 : 50;
    const r = el.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': setView((v) => ({ ...v, x: v.x + step })); break;
      case 'ArrowRight': setView((v) => ({ ...v, x: v.x - step })); break;
      case 'ArrowUp': setView((v) => ({ ...v, y: v.y + step })); break;
      case 'ArrowDown': setView((v) => ({ ...v, y: v.y - step })); break;
      case '+': case '=': setView((v) => zoomAround(v, cx, cy, 1.25)); break;
      case '-': case '_': setView((v) => zoomAround(v, cx, cy, 0.8)); break;
      case '0': onFit(); break;
      case '1': setView((v) => zoomAround(v, cx, cy, 1 / v.scale)); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); onInteract?.(); }
  };

  const transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  return (
    <div
      ref={(el) => { elRef.current = el; viewportRef?.(el); }}
      className={`viewport${picking ? ' is-picking' : ''}${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role="group"
      aria-roledescription="zoomable view"
      aria-label={`${label}. Drag or use arrow keys to pan, scroll or plus and minus to zoom, 0 to fit.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {layers.map((l) => (
        <div key={l.key} className="vp-layer" style={l.clip ? { clipPath: l.clip } : undefined}>
          <div className="vp-content" style={{ width, height, transform }}>{l.node}</div>
        </div>
      ))}
      {badge && <span className="pane-badge" aria-hidden="true">{badge}</span>}
      {children}
    </div>
  );
}
