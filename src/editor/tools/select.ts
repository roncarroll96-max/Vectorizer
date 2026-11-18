import type { Box, Mat, Shape, Vec } from '../model/types';
import type { Drag, PointerInfo, Tool } from './types';
import type { EditorStore } from '../store';
import { getShape, parentMatrix, updateShapes, duplicateShapes } from '../model/doc';
import { boxesIntersect, normalizeBox, shapeBounds } from '../model/geometry';
import { rotateAbout, scaleAbout, translate } from '../model/matrix';
import { snapBox } from '../model/snap';
import { toPath, transformShape } from '../model/shapes';
import { hitShapeId, snapTargets, snapThreshold } from './common';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

function startTransform(store: EditorStore, apply: (p: PointerInfo, box: Box) => { t: Mat }) {
  const s0 = store.getState();
  const box = store.selectionBounds();
  if (!box) return null;
  store.begin();
  const base = s0.doc;
  const pms = new Map(s0.selection.map((id) => [id, parentMatrix(base, id)]));
  const drag: Drag = {
    move(p) {
      const { t } = apply(p, box);
      store.live(updateShapes(base, s0.selection, (s) => transformShape(s, t, pms.get(s.id))));
    },
    up() { store.end(); store.setUi({ guides: [] }); },
  };
  return drag;
}

function moveDrag(store: EditorStore, start: PointerInfo, clickedId: string | null): Drag | null {
  const s0 = store.getState();
  const box = store.selectionBounds();
  if (!box) return null;
  const targets = snapTargets(store, s0.selection);
  let base = s0.doc;
  let ids = s0.selection;
  let moved = false;
  store.begin();
  return {
    move(p) {
      let dx = p.doc[0] - start.doc[0], dy = p.doc[1] - start.doc[1];
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      if (!moved && p.alt) {
        // Alt-drag duplicates and moves the copies.
        const r = duplicateShapes(base, ids, 0);
        base = r.doc;
        ids = r.newIds;
        store.select(ids);
      }
      moved = true;
      if (p.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      let guides: ReturnType<typeof snapBox>['guides'] = [];
      if (s0.snapping && !p.mod) {
        const r = snapBox({ ...box, x: box.x + dx, y: box.y + dy }, targets, snapThreshold(store));
        if (!p.shift || dy === 0) dx += r.dx;
        if (!p.shift || dx === 0) dy += r.dy;
        guides = r.guides;
      }
      const pms = new Map(ids.map((id) => [id, parentMatrix(base, id)]));
      store.live(updateShapes(base, ids, (s) => transformShape(s, translate(dx, dy), pms.get(s.id))));
      store.setUi({ guides });
    },
    up() {
      store.end();
      store.setUi({ guides: [] });
      // A plain click on a shape inside a multi-selection narrows it to that shape.
      if (!moved && clickedId && !start.shift && store.getState().selection.length > 1) store.select([clickedId]);
    },
  };
}

function resizeDrag(store: EditorStore, handle: HandleId): Drag | null {
  const targets = snapTargets(store, store.getState().selection);
  return startTransform(store, (p, box) => {
    const left = box.x, right = box.x + box.w, top = box.y, bottom = box.y + box.h;
    let x0 = left, x1 = right, y0 = top, y1 = bottom;
    let [px, py] = p.doc;
    const st = store.getState();
    if (st.snapping && !p.mod) {
      const th = snapThreshold(store);
      const r = snapBox({ x: px, y: py, w: 0, h: 0 }, targets, th, { x: [px], y: [py] });
      if (handle.includes('e') || handle.includes('w')) px += r.dx;
      if (handle.includes('n') || handle.includes('s')) py += r.dy;
      store.setUi({ guides: r.guides.filter((g) => (g.axis === 'x' ? /[ew]/.test(handle) : /[ns]/.test(handle))) });
    }
    if (handle.includes('e')) x1 = px;
    if (handle.includes('w')) x0 = px;
    if (handle.includes('s')) y1 = py;
    if (handle.includes('n')) y0 = py;
    const cx = left + box.w / 2, cy = top + box.h / 2;
    let ax = handle.includes('w') ? right : left;
    let ay = handle.includes('n') ? bottom : top;
    let sx = box.w ? (x1 - x0) / box.w : 1;
    let sy = box.h ? (y1 - y0) / box.h : 1;
    if (handle === 'n' || handle === 's') sx = 1;
    if (handle === 'e' || handle === 'w') sy = 1;
    if (p.alt) {
      ax = cx; ay = cy;
      if (sx !== 1) sx = 2 * sx - 1;
      if (sy !== 1) sy = 2 * sy - 1;
    }
    if (p.shift) {
      const k = handle.length === 2 ? Math.max(Math.abs(sx), Math.abs(sy)) : handle === 'n' || handle === 's' ? Math.abs(sy) : Math.abs(sx);
      sx = Math.sign(sx || 1) * k;
      sy = Math.sign(sy || 1) * k;
    }
    // avoid collapsing to zero, which would lose the geometry
    const minS = 1e-3;
    if (Math.abs(sx) < minS) sx = sx < 0 ? -minS : minS;
    if (Math.abs(sy) < minS) sy = sy < 0 ? -minS : minS;
    return { t: scaleAbout(sx, sy, ax, ay) };
  });
}

function rotateDrag(store: EditorStore, start: PointerInfo): Drag | null {
  const box = store.selectionBounds();
  if (!box) return null;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const a0 = Math.atan2(start.doc[1] - cy, start.doc[0] - cx);
  return startTransform(store, (p) => {
    let deg = ((Math.atan2(p.doc[1] - cy, p.doc[0] - cx) - a0) * 180) / Math.PI;
    if (p.shift) deg = Math.round(deg / 15) * 15;
    return { t: rotateAbout(deg, cx, cy) };
  });
}

function marqueeDrag(store: EditorStore, start: PointerInfo): Drag {
  const initial = start.shift ? store.getState().selection : [];
  const candidates = store.scopeShapes().filter((s) => !s.locked && !s.hidden);
  const { doc } = store.getState();
  const boxes = new Map(candidates.map((s) => [s.id, shapeBounds(s, parentMatrix(doc, s.id))]));
  let moved = false;
  return {
    move(p) {
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      moved = true;
      const m = normalizeBox(start.doc[0], start.doc[1], p.doc[0], p.doc[1]);
      const hits = candidates.filter((s) => { const b = boxes.get(s.id); return b && boxesIntersect(b, m); }).map((s) => s.id);
      store.set({ selection: [...new Set([...initial, ...hits])], nodeSelection: [] });
      store.setUi({ marquee: m });
    },
    up() {
      store.setUi({ marquee: null });
      if (!moved && !start.shift) {
        // Clicking empty canvas: deselect, and leave an entered group.
        store.select([], store.getState().selection.length ? store.getState().scope : null);
      }
    },
  };
}

export const selectTool: Tool = {
  down(p, { store }) {
    const handle = p.target.closest('[data-handle]')?.getAttribute('data-handle') as HandleId | null;
    if (handle && store.getState().selection.length) {
      return handle === 'rot' ? rotateDrag(store, p) : resizeDrag(store, handle);
    }
    const hit = hitShapeId(p.target);
    const r = hit ? store.resolveHit(hit) : null;
    if (r) {
      const { selection } = store.getState();
      if (p.shift) {
        const next = selection.includes(r.id) ? selection.filter((x) => x !== r.id) : [...selection, r.id];
        store.select(next, r.scope);
        if (!next.includes(r.id)) return null;
      } else if (!selection.includes(r.id)) {
        store.select([r.id], r.scope);
      }
      return moveDrag(store, p, r.id);
    }
    return marqueeDrag(store, p);
  },

  hover(p, { store }) {
    const hit = hitShapeId(p.target);
    const r = hit ? store.resolveHit(hit) : null;
    const id = r?.id ?? null;
    if (store.getState().ui.hoverId !== id) store.setUi({ hoverId: id });
  },

  dblclick(p, { store }) {
    const hit = hitShapeId(p.target);
    const r = hit ? store.resolveHit(hit) : null;
    if (!r) {
      if (store.getState().scope) store.select([], null); // leave the group
      return;
    }
    const s = getShape(store.getState().doc, r.id) as Shape;
    if (s.type === 'group') {
      // Enter the group and select the child under the pointer.
      store.set({ scope: s.id });
      const inner = store.resolveHit(hit!);
      store.select(inner ? [inner.id] : [], s.id);
    } else if (s.type === 'text') {
      store.select([s.id]);
      store.setUi({ editingText: { id: s.id, pos: [s.x, s.y] } });
    } else {
      if (s.type !== 'path') store.updateShape(s.id, toPath);
      store.select([s.id]);
      store.setTool('node');
    }
  },
};

/** Screen-space handle positions for a document box. */
export function handlePositions(b: Box, toScreen: (p: Vec) => Vec): { id: HandleId; p: Vec }[] {
  const [x0, y0] = toScreen([b.x, b.y]);
  const [x1, y1] = toScreen([b.x + b.w, b.y + b.h]);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return [
    { id: 'nw', p: [x0, y0] }, { id: 'n', p: [mx, y0] }, { id: 'ne', p: [x1, y0] }, { id: 'e', p: [x1, my] },
    { id: 'se', p: [x1, y1] }, { id: 's', p: [mx, y1] }, { id: 'sw', p: [x0, y1] }, { id: 'w', p: [x0, my] },
    { id: 'rot', p: [mx, y0 - 26] },
  ];
}
