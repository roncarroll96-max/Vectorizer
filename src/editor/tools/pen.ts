import type { PathNode, Vec } from '../model/types';
import type { Tool } from './types';
import type { EditorStore } from '../store';
import { makePath } from '../model/shapes';
import { constrain45, maybeSnap, snapTargets } from './common';

function finish(store: EditorStore, closed: boolean) {
  const nodes = store.getState().ui.pen;
  store.setUi({ pen: null, pointer: null, guides: [] });
  if (!nodes || nodes.length < 2) return;
  const { defaults } = store.getState();
  const path = makePath([{ nodes, closed }], {
    fill: closed ? defaults.fill : 'none',
    // open paths need a visible stroke even if new shapes default to none
    stroke: closed || defaults.stroke !== 'none' ? defaults.stroke : '#1d2433',
    strokeWidth: defaults.strokeWidth || 2,
    opacity: 1,
    fillRule: 'nonzero',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  });
  store.addShapes([path]);
}

export const penTool: Tool = {
  down(p, { store }) {
    const draft = store.getState().ui.pen ?? [];
    const closeDist = 8 / store.getState().view.scale;
    if (draft.length >= 2 && Math.hypot(p.doc[0] - draft[0].p[0], p.doc[1] - draft[0].p[1]) <= closeDist) {
      finish(store, true);
      return null;
    }
    const last = draft[draft.length - 1];
    let pt: Vec = last && p.shift ? constrain45(last.p, p.doc) : maybeSnap(store, p.doc, p.mod, snapTargets(store));
    if (last && Math.hypot(pt[0] - last.p[0], pt[1] - last.p[1]) < 1e-6) pt = last.p;
    const node: PathNode = { p: pt, kind: 'corner' };
    const nodes = [...draft, node];
    store.setUi({ pen: nodes });
    const index = nodes.length - 1;
    return {
      move(m) {
        const d = Math.hypot(m.doc[0] - pt[0], m.doc[1] - pt[1]);
        if (d * store.getState().view.scale < 3) return;
        const out: Vec = m.shift ? constrain45(pt, m.doc) : m.doc;
        const curr = store.getState().ui.pen;
        if (!curr) return;
        const n: PathNode = { p: pt, out, in: [2 * pt[0] - out[0], 2 * pt[1] - out[1]], kind: 'symmetric' };
        store.setUi({ pen: curr.map((x, i) => (i === index ? n : x)) });
      },
      up() { store.setUi({ guides: [] }); },
    };
  },

  hover(p, { store }) {
    if (!store.getState().ui.pen) return;
    const draft = store.getState().ui.pen!;
    const last = draft[draft.length - 1];
    store.setUi({ pointer: last && p.shift ? constrain45(last.p, p.doc) : p.doc });
  },

  dblclick(_p, { store }) {
    const draft = store.getState().ui.pen;
    if (!draft) return;
    // The double-click's second press added a duplicate node; drop it.
    const n = draft.length;
    const trimmed = n >= 2 && Math.hypot(draft[n - 1].p[0] - draft[n - 2].p[0], draft[n - 1].p[1] - draft[n - 2].p[1]) < 1e-6 ? draft.slice(0, -1) : draft;
    store.setUi({ pen: trimmed });
    finish(store, false);
  },

  key(e, { store }) {
    const draft = store.getState().ui.pen;
    if (!draft) return false;
    if (e.key === 'Enter' || e.key === 'Escape') { finish(store, false); return true; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      store.setUi({ pen: draft.length > 1 ? draft.slice(0, -1) : null });
      return true;
    }
    return false;
  },

  deactivate({ store }) { finish(store, false); },
};
