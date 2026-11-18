import type { Box, Shape, Vec } from '../model/types';
import type { EditorStore } from '../store';
import { getShape, parentMatrix } from '../model/doc';
import { shapeBounds } from '../model/geometry';
import { buildTargets, snapPoint, type SnapTargets } from '../model/snap';

/** The shape id under the pointer (deepest), from the rendered DOM. */
export function hitShapeId(target: Element): string | null {
  const el = target.closest('[data-id]');
  return el ? el.getAttribute('data-id') : null;
}

/** Snap distance in document units (constant on screen). */
export function snapThreshold(store: EditorStore): number {
  return 6 / store.getState().view.scale;
}

/** Edges/centres of every visible shape in scope (except `exclude`) plus the canvas. */
export function snapTargets(store: EditorStore, exclude: Iterable<string> = []): SnapTargets {
  const { doc } = store.getState();
  const ex = new Set(exclude);
  const boxes: Box[] = [];
  const visit = (shapes: Shape[]) => {
    for (const s of shapes) {
      if (ex.has(s.id) || s.hidden) continue;
      const b = shapeBounds(s, parentMatrix(doc, s.id));
      if (b) boxes.push(b);
    }
  };
  visit(store.scopeShapes());
  return buildTargets(boxes, { x: 0, y: 0, w: doc.width, h: doc.height });
}

/** Snaps a point when snapping is on (Ctrl/Cmd temporarily disables it). */
export function maybeSnap(store: EditorStore, p: Vec, disable: boolean, targets: SnapTargets | null): Vec {
  if (!store.getState().snapping || disable || !targets) { store.setUi({ guides: [] }); return p; }
  const r = snapPoint(p, targets, snapThreshold(store));
  store.setUi({ guides: r.guides });
  return r.p;
}

export function constrain45(from: Vec, to: Vec): Vec {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const l = Math.hypot(dx, dy);
  return [from[0] + Math.cos(a) * l, from[1] + Math.sin(a) * l];
}

export function shapeOf(store: EditorStore, id: string): Shape | null {
  return getShape(store.getState().doc, id);
}
