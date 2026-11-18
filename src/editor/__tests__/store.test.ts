// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorStore } from '../store';
import { defaultStyle, makeRect, makeEllipse } from '../model/shapes';
import { getShape } from '../model/doc';
import { shapeBounds } from '../model/geometry';

let store: EditorStore;
const rect = (x: number, y: number, fill = '#ff0000') => makeRect(x, y, 50, 40, defaultStyle({ fill }));

beforeEach(() => { store = new EditorStore(); });

describe('history', () => {
  it('undoes and redoes commits', () => {
    const a = rect(0, 0);
    store.addShapes([a]);
    store.addShapes([rect(100, 0)]);
    expect(store.getState().doc.shapes).toHaveLength(2);
    store.undo();
    expect(store.getState().doc.shapes).toHaveLength(1);
    store.undo();
    expect(store.getState().doc.shapes).toHaveLength(0);
    store.redo();
    store.redo();
    expect(store.getState().doc.shapes).toHaveLength(2);
    store.undo();
    store.addShapes([rect(5, 5)]);
    expect(store.getState().future).toHaveLength(0); // a new edit clears redo
  });

  it('records a whole gesture as one step', () => {
    store.addShapes([rect(0, 0)]);
    const id = store.getState().selection[0];
    store.begin();
    for (let i = 1; i <= 10; i++) {
      store.live({ ...store.getState().doc, shapes: [{ ...getShape(store.getState().doc, id)!, name: `n${i}` }] });
    }
    store.end();
    expect(store.getState().past).toHaveLength(2);
    store.undo();
    expect(getShape(store.getState().doc, id)!.name).toBe('Rectangle');
  });

  it('coalesces rapid edits with the same key (e.g. dragging a color picker)', () => {
    store.addShapes([rect(0, 0)]);
    for (const c of ['#111111', '#222222', '#333333']) store.setStyle({ fill: c }, 'fill');
    expect(store.getState().past).toHaveLength(2);
    store.undo();
    expect(store.selectedShapes()[0].style.fill).toBe('#ff0000');
  });

  it('drops deleted shapes from the selection on undo', () => {
    store.addShapes([rect(0, 0)]);
    store.undo();
    expect(store.getState().selection).toEqual([]);
  });
});

describe('editing actions', () => {
  it('groups, ungroups, duplicates and deletes', () => {
    store.addShapes([rect(0, 0), rect(100, 0)]);
    store.group();
    expect(store.getState().doc.shapes).toHaveLength(1);
    expect(store.selectedShapes()[0].type).toBe('group');
    store.ungroup();
    expect(store.getState().doc.shapes).toHaveLength(2);
    expect(store.getState().selection).toHaveLength(2);
    store.duplicate();
    expect(store.getState().doc.shapes).toHaveLength(4);
    store.deleteSelection();
    expect(store.getState().doc.shapes).toHaveLength(2);
  });

  it('aligns multiple shapes to their combined bounds', () => {
    store.addShapes([rect(0, 0), rect(100, 30)]);
    store.align('top');
    expect(store.selectedShapes().map((s) => shapeBounds(s)!.y)).toEqual([0, 0]);
    store.align('right');
    expect(store.selectedShapes().map((s) => shapeBounds(s)!.x)).toEqual([100, 100]);
  });

  it('sets the selection box (X/Y/W/H fields)', () => {
    store.addShapes([rect(10, 10)]);
    store.setSelectionBox({ x: 0, w: 100 });
    const b = store.selectionBounds()!;
    expect([b.x, b.y, b.w, b.h]).toEqual([0, 10, 100, 40]);
  });

  it('applies fill to every shape inside a selected group', () => {
    store.addShapes([rect(0, 0), makeEllipse(100, 100, 10, 10, defaultStyle())]);
    store.group();
    store.setStyle({ fill: '#00ff00' });
    const g = store.selectedShapes()[0];
    expect(g.type === 'group' && g.children.every((c) => c.style.fill === '#00ff00')).toBe(true);
  });

  it('copy/paste offsets the copies and selects them', () => {
    store.addShapes([rect(0, 0)]);
    const svg = store.copy();
    expect(svg).toContain('<rect');
    store.paste();
    expect(store.getState().doc.shapes).toHaveLength(2);
    expect(shapeBounds(store.selectedShapes()[0])!.x).toBe(10);
    store.paste();
    expect(shapeBounds(store.selectedShapes()[0])!.x).toBe(20);
  });

  it('with nothing selected, style changes set the defaults for new shapes', () => {
    store.setStyle({ fill: '#abcdef' });
    expect(store.getState().defaults.fill).toBe('#abcdef');
    expect(store.getState().past).toHaveLength(0);
  });

  it('enters a group scope and resolves clicks to its children', () => {
    const a = rect(0, 0), b = rect(100, 0);
    store.addShapes([a, b]);
    store.group();
    const gid = store.getState().selection[0];
    expect(store.resolveHit(a.id)).toEqual({ id: gid, scope: null });
    store.set({ scope: gid });
    expect(store.resolveHit(a.id)).toEqual({ id: a.id, scope: gid });
  });

  it('loads SVG and resets history', () => {
    store.addShapes([rect(0, 0)]);
    store.loadSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>', 'dot.svg');
    const st = store.getState();
    expect(st.doc.shapes[0].type).toBe('ellipse');
    expect(st.past).toHaveLength(0);
    expect(st.fileName).toBe('dot');
    expect(st.dirty).toBe(false);
  });

  it('deletes selected nodes, removing the path when too few remain', () => {
    store.pasteSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 0L10 10L0 10Z"/></svg>');
    store.set({ nodeSelection: ['0:1'] });
    store.deleteSelectedNodes();
    const p = store.activePath()!;
    expect(p.subpaths[0].nodes).toHaveLength(3);
    store.set({ nodeSelection: ['0:0', '0:1'] });
    store.deleteSelectedNodes();
    expect(store.getState().doc.shapes).toHaveLength(0);
  });
});
