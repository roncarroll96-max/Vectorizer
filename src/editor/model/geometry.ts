import type { Box, Mat, Shape, TextShape, Vec } from './types';
import { IDENTITY, apply, mul } from './matrix';
import { subpathBounds } from './path';
import { shapeSubpaths } from './shapes';

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Width of each text line in user units (canvas measurement, approximated in tests). */
export function textLineWidths(t: TextShape): number[] {
  const lines = t.text.split('\n');
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch { measureCtx = null; }
  }
  if (measureCtx) {
    measureCtx.font = `${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
    return lines.map((l) => measureCtx!.measureText(l || ' ').width);
  }
  return lines.map((l) => Math.max(1, l.length) * t.fontSize * 0.56);
}

export const TEXT_LINE_HEIGHT = 1.2;

export function textLocalBox(t: TextShape): Box {
  const widths = textLineWidths(t);
  const w = Math.max(...widths, t.fontSize * 0.3);
  const lines = widths.length;
  const x = t.textAnchor === 'middle' ? t.x - w / 2 : t.textAnchor === 'end' ? t.x - w : t.x;
  const top = t.y - t.fontSize * 0.9;
  return { x, y: top, w, h: t.fontSize * (1.1 + (lines - 1) * TEXT_LINE_HEIGHT) };
}

function boxOfPoints(pts: Vec[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBoxes(boxes: (Box | null)[]): Box | null {
  const bs = boxes.filter((b): b is Box => !!b);
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Axis-aligned bounds in document space; `parent` is the combined ancestor matrix. */
export function shapeBounds(s: Shape, parent: Mat = IDENTITY): Box | null {
  const m = mul(parent, s.transform);
  switch (s.type) {
    case 'group': return unionBoxes(s.children.filter((c) => !c.hidden).map((c) => shapeBounds(c, m)));
    case 'ellipse': {
      const [cx, cy] = apply(m, [s.cx, s.cy]);
      const hw = Math.hypot(m[0] * s.rx, m[2] * s.ry), hh = Math.hypot(m[1] * s.rx, m[3] * s.ry);
      return { x: cx - hw, y: cy - hh, w: 2 * hw, h: 2 * hh };
    }
    case 'rect':
      return boxOfPoints([[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]].map((p) => apply(m, p as Vec)));
    case 'text': {
      const b = textLocalBox(s);
      return boxOfPoints([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map((p) => apply(m, p as Vec)));
    }
    default:
      return subpathBounds(shapeSubpaths(s) ?? [], m);
  }
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function normalizeBox(x0: number, y0: number, x1: number, y1: number): Box {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
