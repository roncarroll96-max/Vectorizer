// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EditorStore } from '../store';
import { defaultStyle, makeRect, makeEllipse } from '../model/shapes';
import { getShape } from '../model/doc';
import { nodeRef, parsePathData } from '../model/path';
import { nodeTool } from '../tools/node';
import type { PointerInfo } from '../tools/types';
import type { PathShape } from '../model/types';
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
    const id = store.activePath()!.id;
    store.set({ nodeSelection: [nodeRef(id, 0, 1)] });
    store.deleteSelectedNodes();
    const p = store.activePath()!;
    expect(p.subpaths[0].nodes).toHaveLength(3);
    store.set({ nodeSelection: [nodeRef(id, 0, 0), nodeRef(id, 0, 1)] });
    store.deleteSelectedNodes();
    expect(store.getState().doc.shapes).toHaveLength(0);
  });
});

describe('split and combine paths', () => {
  // Two "O"s (outer + hole each) and a lone square, as one compound path.
  const D = 'M0 0H10V10H0Z M2 2V8H8V2Z M20 0H30V10H20Z M22 2V8H28V2Z M40 0H50V10H40Z';
  const compound = (fillRule: 'nonzero' | 'evenodd' = 'evenodd'): PathShape => ({
    id: 'p1', name: 'Path', type: 'path', transform: [1, 0, 0, 1, 0, 0],
    style: defaultStyle({ fill: '#000000', fillRule }), subpaths: parsePathData(D),
  });

  it('splits a compound path into separate shapes, keeping holes with their shape', () => {
    store.addShapes([rect(100, 100), compound(), rect(200, 100)]);
    store.select(['p1']);
    store.splitPaths();
    const { doc, selection } = store.getState();
    expect(selection).toHaveLength(3);
    expect(doc.shapes).toHaveLength(5);
    // pieces take the original's place in the stacking order
    expect(doc.shapes.slice(1, 4).map((s) => s.id)).toEqual(selection);
    const pieces = selection.map((id) => getShape(doc, id) as PathShape);
    expect(pieces.map((p) => p.subpaths.length)).toEqual([2, 2, 1]);
    expect(pieces.every((p) => p.style.fill === '#000000' && p.style.fillRule === 'evenodd')).toBe(true);
    store.undo();
    expect(store.getState().doc.shapes).toHaveLength(3);
  });

  it('does nothing for a path with a single shape', () => {
    store.addShapes([{ ...compound(), subpaths: parsePathData('M0 0H10V10H0Z M2 2V8H8V2Z') }]);
    store.select(['p1']);
    const before = store.getState().doc;
    store.splitPaths();
    expect(store.getState().doc).toBe(before);
  });

  it('combines shapes into one compound path in place, then splits back', () => {
    const a = rect(0, 0, '#ff0000');
    const b = makeEllipse(200, 50, 20, 20, defaultStyle({ fill: '#00ff00' }));
    store.addShapes([a, b]);
    store.select([a.id, b.id]);
    const boundsBefore = store.selectionBounds();
    store.combinePaths();
    const { doc, selection } = store.getState();
    expect(doc.shapes).toHaveLength(1);
    expect(selection).toEqual([b.id]);
    const p = doc.shapes[0] as PathShape;
    expect(p.type).toBe('path');
    expect(p.subpaths).toHaveLength(2);
    expect(p.style.fill).toBe('#00ff00'); // topmost shape's style
    expect(store.selectionBounds()).toEqual(boundsBefore);
    store.splitPaths();
    expect(store.getState().doc.shapes).toHaveLength(2);
  });
});

describe('node tool box selection', () => {
  const sq = (id: string, x: number): PathShape => ({
    id, name: id, type: 'path', transform: [1, 0, 0, 1, 0, 0],
    style: defaultStyle(), subpaths: parsePathData(`M${x} 0H${x + 10}V10H${x}Z`),
  });
  const empty = document.createElement('div');
  const ptr = (x: number, y: number, shift = false, target: Element = empty): PointerInfo =>
    ({ doc: [x, y], screen: [x, y], shift, alt: false, mod: false, target });
  const box = (x0: number, y0: number, x1: number, y1: number, shift = false, target?: Element) => {
    const drag = nodeTool.down(ptr(x0, y0, shift, target), { store })!;
    drag.move(ptr(x1, y1, shift, target));
    drag.up(ptr(x1, y1, shift, target));
  };

  beforeEach(() => {
    store.addShapes([sq('a', 0), sq('b', 20), sq('c', 40)]);
    store.select([]);
    store.setTool('node');
  });

  it('selects only the nodes inside the box, across separate paths', () => {
    // covers the right edge of "a" and the left edge of "b", nothing of "c"
    box(5, -1, 25, 11);
    const st = store.getState();
    expect(new Set(st.nodeSelection)).toEqual(new Set([
      nodeRef('a', 0, 1), nodeRef('a', 0, 2), nodeRef('b', 0, 0), nodeRef('b', 0, 3),
    ]));
    expect(st.selection).toEqual(['a', 'b']);
  });

  it('starts a box even when the drag begins on top of a shape', () => {
    const onShape = document.createElement('div');
    onShape.setAttribute('data-id', 'c');
    box(45, 5, 55, 15, false, onShape);
    expect(new Set(store.getState().nodeSelection)).toEqual(new Set([nodeRef('c', 0, 2)]));
  });

  it('adds to the selection with Shift', () => {
    box(-2, -2, 2, 2);
    box(38, -2, 42, 2, true);
    expect(store.getState().nodeSelection).toEqual([nodeRef('a', 0, 0), nodeRef('c', 0, 0)]);
    expect(store.getState().selection).toEqual(['a', 'c']);
  });

  it('moves, nudges and deletes nodes on several paths at once', () => {
    box(5, -1, 25, 11);
    store.nudgeNodes(0, 5);
    const node = (id: string, ni: number) => (getShape(store.getState().doc, id) as PathShape).subpaths[0].nodes[ni].p;
    expect(node('a', 1)).toEqual([10, 5]);
    expect(node('b', 0)).toEqual([20, 5]);
    expect(node('a', 0)).toEqual([0, 0]); // unselected nodes stay
    store.deleteSelectedNodes();
    expect((getShape(store.getState().doc, 'a') as PathShape).subpaths[0].nodes).toHaveLength(2);
    expect((getShape(store.getState().doc, 'b') as PathShape).subpaths[0].nodes).toHaveLength(2);
  });

  it('a plain click on a shape still picks it for editing', () => {
    const onShape = document.createElement('div');
    onShape.setAttribute('data-id', 'b');
    nodeTool.down(ptr(25, 5, false, onShape), { store })!.up(ptr(25, 5, false, onShape));
    expect(store.getState().selection).toEqual(['b']);
  });
});
