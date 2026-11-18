import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { editorStore, useEditor, type View } from '../store';
import { TOOLS } from '../tools';
import type { Drag, PointerInfo } from '../tools/types';
import { ShapeView } from './ShapeView';
import { Overlay } from './Overlay';
import { TextEditor } from './TextEditor';
import { isTypingTarget } from './isField';

const MIN_Z = 0.02, MAX_Z = 64;

export function zoomAt(v: View, px: number, py: number, factor: number): View {
  const scale = Math.min(MAX_Z, Math.max(MIN_Z, v.scale * factor));
  const k = scale / v.scale;
  return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

const CURSORS: Record<string, string> = {
  select: 'default', node: 'default', pen: 'crosshair', rect: 'crosshair', ellipse: 'crosshair',
  line: 'crosshair', polygon: 'crosshair', text: 'text', hand: 'grab',
};

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const tool = useEditor((s) => s.tool);
  const fitRequest = useEditor((s) => s.fitRequest);
  const editingId = useEditor((s) => s.ui.editingText?.id ?? null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);

  const fit = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const { doc: d } = editorStore.getState();
    const pad = Math.min(64, r.width * 0.08);
    const scale = Math.min(MAX_Z, Math.max(MIN_Z, Math.min((r.width - pad * 2) / d.width, (r.height - pad * 2) / d.height)));
    editorStore.setView({ scale, x: (r.width - d.width * scale) / 2, y: (r.height - d.height * scale) / 2 });
  }, []);

  useLayoutEffect(() => { fit(); }, [fitRequest, fit]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let prev: { w: number; h: number } | null = null;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      if (!r.width || !r.height) return;
      if (!prev || Math.abs(r.width - prev.w) > prev.w * 0.3 || Math.abs(r.height - prev.h) > prev.h * 0.3) {
        fit(); // first layout or a big change (e.g. rotating a phone)
      } else {
        // small resize: keep whatever was in the middle of the canvas in the middle
        const v = editorStore.getState().view;
        editorStore.setView({ ...v, x: v.x + (r.width - prev.w) / 2, y: v.y + (r.height - prev.h) / 2 });
      }
      prev = { w: r.width, h: r.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Wheel: pan; Ctrl/Cmd + wheel (and trackpad pinch): zoom at the cursor.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      const v = editorStore.getState().view;
      if (e.ctrlKey || e.metaKey) {
        editorStore.setView(zoomAt(v, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * unit * 0.01)));
      } else {
        const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
        const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
        editorStore.setView({ ...v, x: v.x - dx, y: v.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Hold space to pan with any tool.
  useEffect(() => {
    const isField = isTypingTarget;
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isField(e.target) && !e.repeat) { e.preventDefault(); setSpaceDown(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    const blur = () => setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  const info = (e: React.PointerEvent | React.MouseEvent): PointerInfo => {
    const r = hostRef.current!.getBoundingClientRect();
    const v = editorStore.getState().view;
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return {
      doc: [(sx - v.x) / v.scale, (sy - v.y) / v.scale], screen: [sx, sy],
      shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey,
      // With pointer capture the event target is the canvas itself, so hit-test the real element under the pointer.
      target: document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.ed-text-editor')) return;
    hostRef.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // second finger: abandon any tool gesture and pinch-zoom instead
      if (drag.current) { editorStore.cancel(); drag.current = null; editorStore.setUi({ marquee: null, guides: [] }); }
      pan.current = null;
      return;
    }
    if (e.button === 1 || spaceDown || tool === 'hand') {
      e.preventDefault();
      pan.current = { x: e.clientX, y: e.clientY };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    drag.current = TOOLS[tool].down(info(e), { store: editorStore });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev && pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const r = hostRef.current!.getBoundingClientRect();
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const m0 = [(prev.x + other.x) / 2 - r.left, (prev.y + other.y) / 2 - r.top];
      const m1 = [(e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top];
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const z = zoomAt(editorStore.getState().view, m0[0], m0[1], d0 ? d1 / d0 : 1);
      editorStore.setView({ ...z, x: z.x + m1[0] - m0[0], y: z.y + m1[1] - m0[1] });
      return;
    }
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan.current) {
      const v = editorStore.getState().view;
      editorStore.setView({ ...v, x: v.x + e.clientX - pan.current.x, y: v.y + e.clientY - pan.current.y });
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (drag.current) drag.current.move(info(e));
    else TOOLS[tool].hover?.(info(e), { store: editorStore });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pan.current) { pan.current = null; setPanning(false); return; }
    const d = drag.current;
    drag.current = null;
    d?.up(info(e));
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.ed-text-editor')) return;
    TOOLS[tool].dblclick?.(info(e), { store: editorStore });
  };

  const cursor = panning ? 'grabbing' : spaceDown ? 'grab' : CURSORS[tool];
  const t = `translate(${view.x} ${view.y}) scale(${view.scale})`;
  const checker = 12 / view.scale;

  return (
    <div
      ref={hostRef}
      className="ed-canvas"
      tabIndex={0}
      role="application"
      aria-label="Drawing canvas. Use the toolbar or keyboard shortcuts; press question mark for the list."
      style={{ cursor, '--z': view.scale } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (!drag.current) editorStore.setUi({ hoverId: null }); }}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="ed-svg" width={size.w} height={size.h}>
        <defs>
          <pattern id="ed-checker" width={checker * 2} height={checker * 2} patternUnits="userSpaceOnUse">
            <rect width={checker * 2} height={checker * 2} className="ed-check-a" />
            <rect width={checker} height={checker} className="ed-check-b" />
            <rect x={checker} y={checker} width={checker} height={checker} className="ed-check-b" />
          </pattern>
          <filter id="ed-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy={2 / view.scale} stdDeviation={6 / view.scale} floodOpacity="0.18" />
          </filter>
        </defs>
        <g transform={t}>
          <rect className="ed-artboard" width={doc.width} height={doc.height} fill={doc.background ?? 'url(#ed-checker)'} filter="url(#ed-shadow)" />
          <g className="ed-doc">
            {doc.shapes.map((s) => <ShapeView key={s.id} shape={s} editingId={editingId} />)}
          </g>
          <rect className="ed-artboard-edge" width={doc.width} height={doc.height} />
        </g>
        <Overlay width={size.w} height={size.h} />
      </svg>
      <TextEditor />
    </div>
  );
}
