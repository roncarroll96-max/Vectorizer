import type { Doc, EllipseShape, LineShape, Mat, PathShape, RectShape, Shape, ShapeType, Style, SubPath, TextShape, Vec } from './types';
import { IDENTITY, apply, invert, isAxisAligned, isIdentity, mul } from './matrix';
import { ellipseSubpath, mapSubpaths, rectSubpath } from './path';

let counter = 0;
export function newId(prefix = 's'): string {
  counter++;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const TYPE_LABEL: Record<ShapeType, string> = {
  rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Path', text: 'Text', group: 'Group',
};

export function defaultStyle(partial: Partial<Style> = {}): Style {
  return { fill: '#4f7cff', stroke: 'none', strokeWidth: 2, opacity: 1, fillRule: 'nonzero', ...partial };
}

export function emptyDoc(width = 800, height = 600): Doc {
  return { width, height, background: '#ffffff', shapes: [] };
}

const base = (type: ShapeType, style: Style, name?: string) => ({
  id: newId(), name: name ?? TYPE_LABEL[type], transform: [...IDENTITY] as Mat, style,
});

export const makeRect = (x: number, y: number, w: number, h: number, style: Style): RectShape =>
  ({ ...base('rect', style), type: 'rect', x, y, w, h, rx: 0 });
export const makeEllipse = (cx: number, cy: number, rx: number, ry: number, style: Style): EllipseShape =>
  ({ ...base('ellipse', style), type: 'ellipse', cx, cy, rx, ry });
export const makeLine = (x1: number, y1: number, x2: number, y2: number, style: Style): LineShape =>
  ({ ...base('line', style), type: 'line', x1, y1, x2, y2 });
export const makePath = (subpaths: SubPath[], style: Style, name?: string): PathShape =>
  ({ ...base('path', style, name), type: 'path', subpaths });
export const makeText = (x: number, y: number, text: string, style: Style): TextShape =>
  ({ ...base('text', style), type: 'text', x, y, text, fontSize: 32, fontFamily: 'system-ui, sans-serif', fontWeight: 400, textAnchor: 'start' });

/** Geometry of rect / ellipse / line / path as subpaths in local coordinates. */
export function shapeSubpaths(s: Shape): SubPath[] | null {
  switch (s.type) {
    case 'path': return s.subpaths;
    case 'rect': return [rectSubpath(s.x, s.y, s.w, s.h, s.rx)];
    case 'ellipse': return [ellipseSubpath(s.cx, s.cy, s.rx, s.ry)];
    case 'line': return [{ closed: false, nodes: [{ p: [s.x1, s.y1], kind: 'corner' }, { p: [s.x2, s.y2], kind: 'corner' }] }];
    default: return null;
  }
}

/** Converts rect / ellipse / line to an editable path (same id and style). */
export function toPath(s: Shape): Shape {
  if (s.type === 'path' || s.type === 'text' || s.type === 'group') return s;
  const subs = shapeSubpaths(s)!;
  return {
    id: s.id, name: s.name, style: s.style, hidden: s.hidden, locked: s.locked,
    type: 'path', transform: [...IDENTITY] as Mat, subpaths: mapSubpaths(subs, s.transform),
  };
}

/**
 * Folds the transform into the geometry wherever that's exact, so stroke widths
 * stay constant and node editing works in plain coordinates.
 */
export function bake(s: Shape): Shape {
  const m = s.transform;
  if (isIdentity(m)) return s;
  switch (s.type) {
    case 'path':
      return { ...s, transform: [...IDENTITY] as Mat, subpaths: mapSubpaths(s.subpaths, m) };
    case 'line': {
      const [x1, y1] = apply(m, [s.x1, s.y1]);
      const [x2, y2] = apply(m, [s.x2, s.y2]);
      return { ...s, transform: [...IDENTITY] as Mat, x1, y1, x2, y2 };
    }
    case 'rect': {
      if (!isAxisAligned(m)) return s;
      const [ax, ay] = apply(m, [s.x, s.y]);
      const [bx, by] = apply(m, [s.x + s.w, s.y + s.h]);
      return { ...s, transform: [...IDENTITY] as Mat, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), rx: s.rx * Math.min(Math.abs(m[0]), Math.abs(m[3])) };
    }
    case 'ellipse': {
      if (!isAxisAligned(m)) return s;
      const [cx, cy] = apply(m, [s.cx, s.cy]);
      return { ...s, transform: [...IDENTITY] as Mat, cx, cy, rx: s.rx * Math.abs(m[0]), ry: s.ry * Math.abs(m[3]) };
    }
    case 'text': {
      if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) {
        return { ...s, transform: [...IDENTITY] as Mat, x: s.x + m[4], y: s.y + m[5] };
      }
      return s;
    }
    default:
      return s;
  }
}

/** Applies a document-space transform to a shape whose ancestors have combined matrix `parent`. */
export function transformShape(s: Shape, t: Mat, parent: Mat = IDENTITY): Shape {
  const local = isIdentity(parent) ? t : mul(invert(parent), mul(t, parent));
  return bake({ ...s, transform: mul(local, s.transform) } as Shape);
}

export function translateShape(s: Shape, d: Vec, parent: Mat = IDENTITY): Shape {
  return transformShape(s, [1, 0, 0, 1, d[0], d[1]], parent);
}

export function cloneShape(s: Shape, keepIds = false): Shape {
  const c = structuredClone(s) as Shape;
  const reid = (x: Shape) => {
    if (!keepIds) x.id = newId();
    if (x.type === 'group') x.children.forEach(reid);
  };
  reid(c);
  return c;
}
