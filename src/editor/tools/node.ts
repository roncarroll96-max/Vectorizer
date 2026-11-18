import type { PathShape, Shape, SubPath, Vec } from '../model/types';
import type { Drag, PointerInfo, Tool } from './types';
import type { EditorStore } from '../store';
import { parentMatrix, updateShapes } from '../model/doc';
import { apply, invert } from '../model/matrix';
import { mapSubpaths, moveHandle, nearestOnPath, nodeKey, setNodeKind, splitSegment, translateNode } from '../model/path';
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

function dragNodes(store: EditorStore, path: PathShape, start: PointerInfo, grabbed: string): Drag {
  const s0 = store.getState();
  const pm = parentMatrix(s0.doc, path.id);
  const inv = invert(pm);
  const sel = new Set(s0.nodeSelection);
  const [gsi, gni] = parseKey(grabbed);
  const grabbedDoc = apply(pm, path.subpaths[gsi].nodes[gni].p);
  const targets = snapTargets(store, [path.id]);
  let moved = false;
  store.begin();
  return {
    move(p) {
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      moved = true;
      const target = maybeSnap(store, [grabbedDoc[0] + p.doc[0] - start.doc[0], grabbedDoc[1] + p.doc[1] - start.doc[1]], p.mod, targets);
      const a = apply(inv, grabbedDoc), b = apply(inv, target);
      const d: Vec = [b[0] - a[0], b[1] - a[1]];
      const subs = path.subpaths.map((s, si) => ({ ...s, nodes: s.nodes.map((n, ni) => (sel.has(nodeKey(si, ni)) ? translateNode(n, d) : n)) }));
      store.live(withSubpaths(s0.doc, path.id, subs));
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

function marqueeNodes(store: EditorStore, path: PathShape | null, start: PointerInfo, onPath = false): Drag {
  const initial = start.shift ? store.getState().nodeSelection : [];
  const docSubs = path ? mapSubpaths(path.subpaths, parentMatrix(store.getState().doc, path.id)) : [];
  let moved = false;
  return {
    move(p) {
      if (!path) return;
      if (!moved && Math.hypot(p.screen[0] - start.screen[0], p.screen[1] - start.screen[1]) < 3) return;
      moved = true;
      const m = normalizeBox(start.doc[0], start.doc[1], p.doc[0], p.doc[1]);
      const keys: string[] = [];
      docSubs.forEach((s, si) => s.nodes.forEach((n, ni) => {
        if (n.p[0] >= m.x && n.p[0] <= m.x + m.w && n.p[1] >= m.y && n.p[1] <= m.y + m.h) keys.push(nodeKey(si, ni));
      }));
      store.set({ nodeSelection: [...new Set([...initial, ...keys])] });
      store.setUi({ marquee: m });
    },
    up() {
      store.setUi({ marquee: null });
      if (!moved && !start.shift) {
        // Clicking the edited path itself only clears the node selection (keeps double-click-to-add working).
        if (store.getState().nodeSelection.length || onPath) store.set({ nodeSelection: [] });
        else store.select([]);
      }
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

export const nodeTool: Tool = {
  down(p, { store }) {
    const path = store.activePath();
    const nodeEl = p.target.closest('[data-node]');
    if (path && nodeEl) {
      const key = nodeEl.getAttribute('data-node')!;
      const ctrl = nodeEl.getAttribute('data-ctrl') as 'in' | 'out' | null;
      if (ctrl) return dragHandle(store, path, key, ctrl, p.alt);
      const { nodeSelection } = store.getState();
      if (p.shift) {
        const next = nodeSelection.includes(key) ? nodeSelection.filter((k) => k !== key) : [...nodeSelection, key];
        store.set({ nodeSelection: next });
        if (!next.includes(key)) return null;
      } else if (!nodeSelection.includes(key)) {
        store.set({ nodeSelection: [key] });
      }
      return dragNodes(store, path, p, key);
    }
    const hit = hitShapeId(p.target);
    if (hit && hit !== path?.id) {
      pickForEditing(store, hit);
      return null;
    }
    return marqueeNodes(store, path, p, !!hit && hit === path?.id);
  },

  dblclick(p, { store }) {
    const path = store.activePath();
    if (!path) return;
    const nodeEl = p.target.closest('[data-node]');
    if (nodeEl && !nodeEl.getAttribute('data-ctrl')) {
      const key = nodeEl.getAttribute('data-node')!;
      const [si, ni] = parseKey(key);
      const node = path.subpaths[si].nodes[ni];
      const kind = node.kind === 'corner' ? 'smooth' : 'corner';
      let subs = setNodeKind(path.subpaths, si, ni, kind);
      if (kind === 'corner') {
        // a corner made from a smooth node: retract the handles to make it sharp
        subs = subs.map((s, i) => (i !== si ? s : { ...s, nodes: s.nodes.map((n, j) => (j === ni ? { p: n.p, kind: 'corner' as const } : n)) }));
      }
      store.commit(withSubpaths(store.getState().doc, path.id, subs), { nodeSelection: [key] });
      return;
    }
    const pm = parentMatrix(store.getState().doc, path.id);
    const local = apply(invert(pm), p.doc);
    const hit = nearestOnPath(path.subpaths, local);
    const tolerance = 10 / store.getState().view.scale;
    if (hit && hit.dist <= tolerance) {
      const subs = splitSegment(path.subpaths, hit.si, hit.seg, hit.t);
      store.commit(withSubpaths(store.getState().doc, path.id, subs), { nodeSelection: [nodeKey(hit.si, hit.seg + 1)] });
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && store.activePath()) {
      const p = store.activePath()!;
      store.set({ nodeSelection: p.subpaths.flatMap((s, si) => s.nodes.map((_, ni) => nodeKey(si, ni))) });
      return true;
    }
    return false;
  },
};
