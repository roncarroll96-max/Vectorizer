import type { Tool } from './types';
import { getShape } from '../model/doc';
import { hitShapeId } from './common';

export const textTool: Tool = {
  down(p, { store }) {
    const hit = hitShapeId(p.target);
    const s = hit ? getShape(store.getState().doc, hit) : null;
    if (s && s.type === 'text' && !s.locked) {
      store.select([s.id]);
      store.setUi({ editingText: { id: s.id, pos: [s.x, s.y] } });
    } else {
      store.select([]);
      store.setUi({ editingText: { id: null, pos: p.doc } });
    }
    return null;
  },
};
