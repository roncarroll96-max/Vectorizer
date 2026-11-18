import type { Shape, Vec } from '../model/types';
import type { Tool } from './types';
import type { EditorStore } from '../store';
import { makeEllipse, makeLine, makePath, makeRect } from '../model/shapes';
import { regularPolygon } from '../model/path';
import { constrain45, maybeSnap, snapTargets } from './common';

type Kind = 'rect' | 'ellipse' | 'line' | 'polygon';

function build(store: EditorStore, kind: Kind, a: Vec, b: Vec, shift: boolean, alt: boolean, id?: string, name?: string): Shape {
  const { defaults, polygonSides } = store.getState();
  const fillStyle = { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: defaults.strokeWidth, opacity: 1, fillRule: 'nonzero' as const };
  let shape: Shape;
  if (kind === 'line') {
    const end = shift ? constrain45(a, b) : b;
    shape = makeLine(a[0], a[1], end[0], end[1], { fill: 'none', stroke: defaults.stroke === 'none' ? '#1d2433' : defaults.stroke, strokeWidth: defaults.strokeWidth || 2, opacity: 1, fillRule: 'nonzero', strokeLinecap: 'round' });
  } else if (kind === 'polygon') {
    let r = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (shift) rot = Math.round(rot / 15) * 15;
    r = Math.max(r, 0.5);
    shape = makePath([regularPolygon(a[0], a[1], r, polygonSides, rot)], fillStyle, 'Polygon');
  } else {
    let w = b[0] - a[0], h = b[1] - a[1];
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    let x = Math.min(a[0], a[0] + w), y = Math.min(a[1], a[1] + h);
    let aw = Math.abs(w), ah = Math.abs(h);
    if (alt) { x = a[0] - aw; y = a[1] - ah; aw *= 2; ah *= 2; }
    shape = kind === 'rect' ? makeRect(x, y, aw, ah, fillStyle) : makeEllipse(x + aw / 2, y + ah / 2, aw / 2, ah / 2, fillStyle);
  }
  if (id) shape.id = id;
  if (name) shape.name = name;
  return shape;
}

let counters: Record<Kind, number> = { rect: 0, ellipse: 0, line: 0, polygon: 0 };
const LABEL: Record<Kind, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', polygon: 'Polygon' };

export function makeDrawTool(kind: Kind): Tool {
  return {
    down(p, { store }) {
      const targets = snapTargets(store);
      const a = maybeSnap(store, p.doc, p.mod, targets);
      counters[kind]++;
      const name = `${LABEL[kind]} ${counters[kind]}`;
      const base = store.getState();
      let id: string | null = null;
      let drew = false;
      return {
        move(m) {
          if (!drew && Math.hypot(m.screen[0] - p.screen[0], m.screen[1] - p.screen[1]) < 3) return;
          if (!drew) { store.begin(); drew = true; }
          const b = maybeSnap(store, m.doc, m.mod, targets);
          const shape = build(store, kind, a, b, m.shift, m.alt, id ?? undefined, name);
          id = shape.id;
          // rebuild from the original document each frame (one undo step at the end)
          store.live(base.doc);
          store.addShapesLive(shape);
        },
        up() {
          store.setUi({ guides: [] });
          if (!drew) {
            if (kind === 'line') return;
            // a click without dragging creates a default-sized shape
            const shape = build(store, kind, kind === 'polygon' ? a : [a[0] - 50, a[1] - 50], kind === 'polygon' ? [a[0] + 50, a[1]] : [a[0] + 50, a[1] + 50], false, false, undefined, name);
            store.addShapes([shape]);
          } else {
            store.end({ selection: id ? [id] : [] });
          }
          store.setTool('select');
        },
      };
    },
  };
}

export function resetDrawCounters() {
  counters = { rect: 0, ellipse: 0, line: 0, polygon: 0 };
}
