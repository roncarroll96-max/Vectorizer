import type { PathShape, Shape, SubPath, Vec } from '../model/types';
import type { Drag, PointerInfo, Tool } from './types';
import type { EditorStore } from '../store';
import { getShape, parentMatrix, updateShapes } from '../model/doc';
import { apply, invert } from '../model/matrix';
import {
  mapSubpaths, moveHandle, nearestOnPath, nodeKey, nodeRef, parseNodeRef, refsByPath, setNodeKind, splitSegment, translateNode,
} from '../model/path';
import { normalizeBox } from '../model/geometry';
import { toPath } from '../model/shapes';
import { hitShapeId, maybeSnap, snapTargets } from './common';

function withSubpaths(base: ReturnType<EditorStore['getState']>['doc'], id: string, subpaths: SubPath[]) {
  return updateShapes(base, [id], (s) => ({ ...s, subpaths }) as Shape);
}

function parseKey(k: string): [number, number] {
  const [a, b] = k.split(':').map(Number);
  return [a, b];
}

/** Drags every selected node, on every path, by the grabbed node's (snapped) offset. */
function dragNodes(store: EditorStore, start: PointerInfo, grabbed: string): Drag {
  const s0 = store.getState();
  const g = parseNodeRef(grabbed);
  const gp = getShape(s0.doc, g.id) as PathShape;
  const grabbedDoc = apply(parentMatrix(s0.doc, g.id), gp.subpaths[g.si].nodes[g.ni].p);
  const byPath = refsByPath(s0.nodeSelection);
  const targets = snapTargets(store, byPath.keys());
  let moved = false;
  store.begin();
  return {
    move(p) {
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      moved = true;
      const target = maybeSnap(store, [grabbedDoc[0] + p.doc[0] - start.doc[0], grabbedDoc[1] + p.doc[1] - start.doc[1]], p.mod, targets);
      let doc = s0.doc;
      for (const [id, keys] of byPath) {
        const path = getShape(s0.doc, id);
        if (path?.type !== 'path') continue;
        const inv = invert(parentMatrix(s0.doc, id));
        const a = apply(inv, grabbedDoc), b = apply(inv, target);
        const d: Vec = [b[0] - a[0], b[1] - a[1]];
        const subs = path.subpaths.map((s, si) => ({ ...s, nodes: s.nodes.map((n, ni) => (keys.has(nodeKey(si, ni)) ? translateNode(n, d) : n)) }));
        doc = withSubpaths(doc, id, subs);
      }
      store.live(doc);
    },
    up() { store.end(); store.setUi({ guides: [] }); },
  };
}

function dragHandle(store: EditorStore, path: PathShape, key: string, which: 'in' | 'out', alt: boolean): Drag {
  const s0 = store.getState();
  const inv = invert(parentMatrix(s0.doc, path.id));
  const [si, ni] = parseKey(key);
  store.begin();
  return {
    move(p) {
      const node = path.subpaths[si].nodes[ni];
      // Alt breaks the handle pair (turns the node into a corner).
      const n = moveHandle(alt ? { ...node, kind: 'corner' } : node, which, apply(inv, p.doc));
      const subs = path.subpaths.map((s, i) => (i !== si ? s : { ...s, nodes: s.nodes.map((x, j) => (j === ni ? n : x)) }));
      store.live(withSubpaths(s0.doc, path.id, subs));
    },
    up() { store.end(); },
  };
}

/** Visible, unlocked paths anywhere in the document (nested groups included). */
function boxablePaths(shapes: Shape[]): PathShape[] {
  return shapes.flatMap((s) => {
    if (s.hidden || s.locked) return [];
    if (s.type === 'group') return boxablePaths(s.children);
    return s.type === 'path' ? [s] : [];
  });
}

/**
 * Press on empty canvas or on a shape body. A drag draws a box that selects
 * every node inside it, on any path (Shift adds to the selection); the paths
 * those nodes belong to become the edited paths. A plain click instead runs
 * `onClick` (pick the clicked shape, or clear the selection).
 */
function marqueeNodes(store: EditorStore, start: PointerInfo, onClick: () => void): Drag {
  const s0 = store.getState();
  const initialNodes = start.shift ? s0.nodeSelection : [];
  const initialSel = start.shift ? s0.selection : [];
  let candidates: { id: string; subs: SubPath[] }[] | null = null; // document-space geometry, built on first move
  let moved = false;
  return {
    move(p) {
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      moved = true;
      candidates ??= boxablePaths(s0.doc.shapes).map((path) => ({ id: path.id, subs: mapSubpaths(path.subpaths, parentMatrix(s0.doc, path.id)) }));
      const m = normalizeBox(start.doc[0], start.doc[1], p.doc[0], p.doc[1]);
      const refs: string[] = [];
      const hitPaths: string[] = [];
      for (const c of candidates) {
        const before = refs.length;
        c.subs.forEach((s, si) => s.nodes.forEach((n, ni) => {
          if (n.p[0] >= m.x && n.p[0] <= m.x + m.w && n.p[1] >= m.y && n.p[1] <= m.y + m.h) refs.push(nodeRef(c.id, si, ni));
        }));
        if (refs.length > before) hitPaths.push(c.id);
      }
      const selection = start.shift ? [...new Set([...initialSel, ...hitPaths])] : hitPaths.length ? hitPaths : s0.selection;
      store.set({ selection, nodeSelection: [...new Set([...initialNodes, ...refs])] });
      store.setUi({ marquee: m });
    },
    up() {
      store.setUi({ marquee: null });
      if (!moved) onClick();
    },
  };
}

/** Selects a clicked shape for node editing, converting primitives to paths. */
function pickForEditing(store: EditorStore, hit: string): boolean {
  const r = store.resolveHit(hit);
  if (!r) return false;
  // In node mode, edit the actual leaf that was clicked, even inside groups.
  const id = hit;
  const shape = (() => {
    const { doc } = store.getState();
    const find = (list: Shape[]): Shape | null => {
      for (const s of list) { if (s.id === id) return s; if (s.type === 'group') { const f = find(s.children); if (f) return f; } }
      return null;
    };
    return find(doc.shapes);
  })();
  if (!shape || shape.type === 'group' || shape.type === 'text') { store.select([r.id], r.scope); return false; }
  if (shape.type !== 'path') store.updateShape(shape.id, toPath);
  store.select([shape.id], store.getState().scope);
  return true;
}

/** Shift+click: adds a clicked shape to the edited paths, keeping the node selection. */
function addForEditing(store: EditorStore, hit: string) {
  const shape = getShape(store.getState().doc, hit);
  if (!shape || shape.type === 'group' || shape.type === 'text' || shape.locked) return;
  if (shape.type !== 'path') store.updateShape(shape.id, toPath);
  const { selection, nodeSelection } = store.getState();
  if (!selection.includes(hit)) store.set({ selection: [...selection, hit], nodeSelection });
}

export const nodeTool: Tool = {
  down(p, { store }) {
    const nodeEl = p.target.closest('[data-node]');
    if (nodeEl) {
      const ref = nodeEl.getAttribute('data-node')!;
      const ctrl = nodeEl.getAttribute('data-ctrl') as 'in' | 'out' | null;
      const path = getShape(store.getState().doc, parseNodeRef(ref).id);
      if (path?.type === 'path') {
        if (ctrl) return dragHandle(store, path, parseNodeRef(ref).key, ctrl, p.alt);
        const { nodeSelection } = store.getState();
        if (p.shift) {
          const next = nodeSelection.includes(ref) ? nodeSelection.filter((k) => k !== ref) : [...nodeSelection, ref];
          store.set({ nodeSelection: next });
          if (!next.includes(ref)) return null;
        } else if (!nodeSelection.includes(ref)) {
          store.set({ nodeSelection: [ref] });
        }
        return dragNodes(store, p, ref);
      }
    }
    const hit = hitShapeId(p.target);
    const editing = !!hit && store.getState().selection.includes(hit);
    return marqueeNodes(store, p, () => {
      const st = store.getState();
      if (hit && !editing) {
        if (p.shift) addForEditing(store, hit);
        else pickForEditing(store, hit);
      } else if (p.shift) {
        // Shift-click on empty canvas or an edited path keeps everything.
      } else if (st.nodeSelection.length || editing) {
        // Clicking an edited path only clears the node selection (keeps double-click-to-add working).
        store.set({ nodeSelection: [] });
      } else {
        store.select([]);
      }
    });
  },

  dblclick(p, { store }) {
    const paths = store.nodePaths();
    if (!paths.length) return;
    const nodeEl = p.target.closest('[data-node]');
    if (nodeEl && !nodeEl.getAttribute('data-ctrl')) {
      const ref = nodeEl.getAttribute('data-node')!;
      const { id, si, ni } = parseNodeRef(ref);
      const path = getShape(store.getState().doc, id);
      if (path?.type !== 'path') return;
      const node = path.subpaths[si].nodes[ni];
      const kind = node.kind === 'corner' ? 'smooth' : 'corner';
      let subs = setNodeKind(path.subpaths, si, ni, kind);
      if (kind === 'corner') {
        // a corner made from a smooth node: retract the handles to make it sharp
        subs = subs.map((s, i) => (i !== si ? s : { ...s, nodes: s.nodes.map((n, j) => (j === ni ? { p: n.p, kind: 'corner' as const } : n)) }));
      }
      store.commit(withSubpaths(store.getState().doc, id, subs), { nodeSelection: [ref] });
      return;
    }
    // Add a node on the closest edited path, if the double-click was on its outline.
    const { doc, view } = store.getState();
    let best: { path: PathShape; hit: NonNullable<ReturnType<typeof nearestOnPath>> } | null = null;
    for (const path of paths) {
      const pm = parentMatrix(doc, path.id);
      const hit = nearestOnPath(path.subpaths, apply(invert(pm), p.doc));
      if (hit && (!best || hit.dist < best.hit.dist)) best = { path, hit };
    }
    if (best && best.hit.dist <= 10 / view.scale) {
      const { path, hit } = best;
      const subs = splitSegment(path.subpaths, hit.si, hit.seg, hit.t);
      store.commit(withSubpaths(doc, path.id, subs), { nodeSelection: [nodeRef(path.id, hit.si, hit.seg + 1)] });
    } else if (!hitShapeId(p.target)) {
      store.setTool('select');
    }
  },

  key(e, { store }) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.getState().nodeSelection.length) {
      store.deleteSelectedNodes();
      return true;
    }
    if (e.key === 'Escape') {
      if (store.getState().nodeSelection.length) store.set({ nodeSelection: [] });
      else store.setTool('select');
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && store.nodePaths().length) {
      store.set({ nodeSelection: store.nodePaths().flatMap((p) => p.subpaths.flatMap((s, si) => s.nodes.map((_, ni) => nodeRef(p.id, si, ni)))) });
      return true;
    }
    return false;
  },
};
