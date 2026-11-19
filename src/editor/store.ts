import { useSyncExternalStore } from 'react';
import type { Box, Doc, Mat, PathNode, PathShape, Shape, Style, SubPath, Vec } from './model/types';
import {
  allShapes, chainTo, duplicateShapes, getShape, groupShapes, insertShapes, parentIdOf, parentMatrix, removeShapes, reorder,
  siblings, ungroupShape, updateShapes, type ReorderOp,
} from './model/doc';
import { shapeBounds, unionBoxes } from './model/geometry';
import { alignOffset, type AlignOp, type Guide } from './model/snap';
import { bake, cloneShape, emptyDoc, newId, toPath, transformShape, translateShape } from './model/shapes';
import { invert, mul, rotateAbout, scaleAbout, translate } from './model/matrix';
import { importSvg } from './model/svgImport';
import { exportSvg, shapesToSvg } from './model/svgExport';
import { cloneSubpaths, deleteNodes, mapSubpaths, nodeKey, setNodeKind, splitSubpaths } from './model/path';

export type ToolId = 'select' | 'node' | 'pen' | 'rect' | 'ellipse' | 'line' | 'polygon' | 'text' | 'hand';

export interface View { x: number; y: number; scale: number }

export interface TextEdit {
  /** Existing text shape being edited, or null for a new one. */
  id: string | null;
  /** Document position for a new text. */
  pos: Vec;
}

export interface UiState {
  marquee: Box | null;
  guides: Guide[];
  pen: PathNode[] | null;
  pointer: Vec | null;
  hoverId: string | null;
  editingText: TextEdit | null;
}

export interface Defaults { fill: string; stroke: string; strokeWidth: number }

export interface EditorState {
  doc: Doc;
  selection: string[];
  /** Group the user has "entered" (double-click), or null for the root. */
  scope: string | null;
  nodeSelection: string[];
  tool: ToolId;
  past: Doc[];
  future: Doc[];
  dirty: boolean;
  fileName: string;
  view: View;
  /** Incremented to ask the canvas to zoom-to-fit. */
  fitRequest: number;
  snapping: boolean;
  polygonSides: number;
  defaults: Defaults;
  ui: UiState;
  warnings: string[];
  toast: string | null;
}

const HISTORY_LIMIT = 200;

function initialState(): EditorState {
  return {
    doc: emptyDoc(), selection: [], scope: null, nodeSelection: [], tool: 'select', past: [], future: [],
    dirty: false, fileName: 'drawing', view: { x: 0, y: 0, scale: 1 }, fitRequest: 1, snapping: true, polygonSides: 6,
    defaults: { fill: '#4f7cff', stroke: 'none', strokeWidth: 2 },
    ui: { marquee: null, guides: [], pen: null, pointer: null, hoverId: null, editingText: null },
    warnings: [], toast: null,
  };
}

export class EditorStore {
  private state: EditorState = initialState();
  private listeners = new Set<() => void>();
  private txBase: Doc | null = null;
  private lastCoalesce: { key: string; time: number } | null = null;
  private clipboard: Shape[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  getState = (): EditorState => this.state;
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };

  set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  setUi(patch: Partial<UiState>) { this.set({ ui: { ...this.state.ui, ...patch } }); }

  reset() { this.state = initialState(); this.txBase = null; this.clipboard = []; this.listeners.forEach((l) => l()); }

  // ------------------------------------------------------------ history

  /** Records a new document state as one undoable step. */
  commit(doc: Doc, extra: Partial<EditorState> = {}, coalesceKey?: string) {
    if (doc === this.state.doc) { if (Object.keys(extra).length) this.set(extra); return; }
    const now = Date.now();
    const coalesce = coalesceKey && this.lastCoalesce?.key === coalesceKey && now - this.lastCoalesce.time < 1200;
    this.lastCoalesce = coalesceKey ? { key: coalesceKey, time: now } : null;
    const past = coalesce ? this.state.past : [...this.state.past, this.state.doc].slice(-HISTORY_LIMIT);
    this.set({ doc, past, future: [], dirty: true, ...extra });
  }

  /** Starts a gesture: live updates until end() records a single undo step. */
  begin() { this.txBase = this.state.doc; this.lastCoalesce = null; }
  live(doc: Doc, extra: Partial<EditorState> = {}) { this.set({ doc, ...extra }); }
  end(extra: Partial<EditorState> = {}) {
    const base = this.txBase;
    this.txBase = null;
    if (base && base !== this.state.doc) {
      this.set({ past: [...this.state.past, base].slice(-HISTORY_LIMIT), future: [], dirty: true, ...extra });
    } else if (Object.keys(extra).length) this.set(extra);
  }
  cancel() { if (this.txBase) { this.set({ doc: this.txBase }); this.txBase = null; } }

  private sanitize(doc: Doc): Partial<EditorState> {
    const selection = this.state.selection.filter((id) => getShape(doc, id));
    const scope = this.state.scope && getShape(doc, this.state.scope) ? this.state.scope : null;
    return { selection, scope, nodeSelection: [] };
  }
  undo() {
    const { past, future, doc } = this.state;
    if (!past.length) return;
    const prev = past[past.length - 1];
    this.lastCoalesce = null;
    this.set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], dirty: true, ...this.sanitize(prev) });
  }
  redo() {
    const { past, future, doc } = this.state;
    if (!future.length) return;
    const next = future[0];
    this.lastCoalesce = null;
    this.set({ doc: next, past: [...past, doc], future: future.slice(1), dirty: true, ...this.sanitize(next) });
  }

  flash(message: string) {
    clearTimeout(this.toastTimer);
    this.set({ toast: message });
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 2400);
  }

  // ------------------------------------------------------------ files

  newDoc(width = 800, height = 600) {
    this.txBase = null;
    this.set({ ...initialState(), doc: emptyDoc(width, height), view: this.state.view, fitRequest: this.state.fitRequest + 1, snapping: this.state.snapping, defaults: this.state.defaults });
  }

  /** Replaces the document with an SVG string. Throws with a friendly message on failure. */
  loadSvg(source: string, fileName = 'drawing') {
    const { doc, warnings } = importSvg(source);
    this.txBase = null;
    this.set({
      doc, selection: [], scope: null, nodeSelection: [], past: [], future: [], dirty: false, warnings,
      fileName: fileName.replace(/\.svg$/i, ''), fitRequest: this.state.fitRequest + 1, tool: 'select',
      ui: { ...this.state.ui, pen: null, editingText: null, marquee: null, guides: [] },
    });
  }

  exportSvg(): string { return exportSvg(this.state.doc); }

  markSaved() { this.set({ dirty: false }); }

  // ------------------------------------------------------------ selection

  select(ids: string[], scope: string | null = this.state.scope) {
    this.set({ selection: ids, scope, nodeSelection: [] });
  }

  /** Top-level selectable shapes in the current scope. */
  scopeShapes(): Shape[] { return siblings(this.state.doc, this.state.scope); }

  selectAll() {
    this.select(this.scopeShapes().filter((s) => !s.locked && !s.hidden).map((s) => s.id));
  }

  /**
   * Maps a clicked shape (possibly deep inside groups) to what a click should
   * select in the current scope. Returns null for locked shapes.
   */
  resolveHit(hitId: string): { id: string; scope: string | null } | null {
    const chain = chainTo(this.state.doc.shapes, hitId);
    if (!chain || chain.some((s) => s.locked)) return null;
    const { scope } = this.state;
    if (scope) {
      const i = chain.findIndex((s) => s.id === scope);
      if (i >= 0 && i < chain.length - 1) return { id: chain[i + 1].id, scope };
    }
    return { id: chain[0].id, scope: null };
  }

  selectedShapes(): Shape[] {
    return this.state.selection.map((id) => getShape(this.state.doc, id)).filter((s): s is Shape => !!s);
  }

  boundsOf(ids: string[]): Box | null {
    const { doc } = this.state;
    return unionBoxes(ids.map((id) => {
      const s = getShape(doc, id);
      return s ? shapeBounds(s, parentMatrix(doc, id)) : null;
    }));
  }

  selectionBounds(): Box | null { return this.boundsOf(this.state.selection); }

  // ------------------------------------------------------------ editing actions

  /** Applies a document-space transform to the selection. */
  transformSelection(t: Mat, coalesce?: string) {
    const { doc, selection } = this.state;
    const next = updateShapes(doc, selection, (s) => transformShape(s, t, parentMatrix(doc, s.id)));
    this.commit(next, {}, coalesce);
  }

  nudge(dx: number, dy: number) {
    if (this.state.tool === 'node' && this.state.nodeSelection.length) { this.nudgeNodes(dx, dy); return; }
    if (!this.state.selection.length) return;
    const { doc, selection } = this.state;
    this.commit(updateShapes(doc, selection, (s) => translateShape(s, [dx, dy], parentMatrix(doc, s.id))), {}, 'nudge');
  }

  deleteSelection() {
    const { selection, doc } = this.state;
    if (!selection.length) return;
    this.commit(removeShapes(doc, selection), { selection: [], nodeSelection: [] });
  }

  duplicate() {
    const { selection, doc } = this.state;
    if (!selection.length) return;
    const { doc: next, newIds } = duplicateShapes(doc, selection);
    this.commit(next, { selection: newIds });
  }

  group() {
    const { selection, doc } = this.state;
    if (!selection.length) return;
    const { doc: next, groupId } = groupShapes(doc, selection);
    if (groupId) this.commit(next, { selection: [groupId] });
  }

  ungroup() {
    let doc = this.state.doc;
    const selection: string[] = [];
    for (const id of this.state.selection) {
      const s = getShape(doc, id);
      if (s?.type === 'group') {
        const r = ungroupShape(doc, id);
        doc = r.doc;
        selection.push(...r.childIds);
      } else selection.push(id);
    }
    this.commit(doc, { selection });
  }

  reorder(op: ReorderOp) {
    const { selection, doc } = this.state;
    if (selection.length) this.commit(reorder(doc, selection, op));
  }

  /** Aligns each selected shape to the selection bounds (or to the canvas for a single shape). */
  align(op: AlignOp) {
    const { selection, doc } = this.state;
    if (!selection.length) return;
    const ref = selection.length > 1 ? this.selectionBounds()! : { x: 0, y: 0, w: doc.width, h: doc.height };
    let next = doc;
    for (const id of selection) {
      const s = getShape(doc, id)!;
      const pm = parentMatrix(doc, id);
      const b = shapeBounds(s, pm);
      if (!b) continue;
      const d = alignOffset(b, ref, op);
      next = updateShapes(next, [id], (x) => translateShape(x, d, pm));
    }
    this.commit(next);
  }

  flip(axis: 'h' | 'v') {
    const b = this.selectionBounds();
    if (!b) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    this.transformSelection(axis === 'h' ? scaleAbout(-1, 1, cx, cy) : scaleAbout(1, -1, cx, cy));
  }

  rotateSelection(deg: number) {
    const b = this.selectionBounds();
    if (!b) return;
    this.transformSelection(rotateAbout(deg, b.x + b.w / 2, b.y + b.h / 2));
  }

  /** Moves/resizes the selection so its bounds become `target`. */
  setSelectionBox(target: Partial<Box>) {
    const b = this.selectionBounds();
    if (!b) return;
    const nb = { ...b, ...target };
    const sx = b.w > 1e-9 ? Math.max(1e-6, nb.w) / b.w : 1;
    const sy = b.h > 1e-9 ? Math.max(1e-6, nb.h) / b.h : 1;
    const t = mul(translate(nb.x, nb.y), mul(scaleAbout(sx, sy), translate(-b.x, -b.y)));
    this.transformSelection(t);
  }

  convertToPath() {
    const { selection, doc } = this.state;
    const next = updateShapes(doc, selection, (s) => toPath(s));
    this.commit(next);
  }

  /**
   * Breaks each selected compound path into one path per separate shape (an
   * outer boundary with its holes). Style, transform and stacking position are
   * kept; the pieces are selected afterwards.
   */
  splitPaths() {
    let doc = this.state.doc;
    const selection: string[] = [];
    let split = 0;
    for (const id of this.state.selection) {
      const s = getShape(doc, id);
      const parts = s?.type === 'path' ? splitSubpaths(s.subpaths, s.style.fillRule) : [];
      if (!s || parts.length < 2) { selection.push(id); continue; }
      const parent = parentIdOf(doc, id);
      const idx = siblings(doc, parent).findIndex((x) => x.id === id);
      const pieces: PathShape[] = parts.map((subs, i) => ({
        ...(s as PathShape), id: newId(), name: `${s.name} ${i + 1}`, subpaths: cloneSubpaths(subs),
      }));
      doc = insertShapes(removeShapes(doc, [id]), parent, pieces, idx);
      selection.push(...pieces.map((p) => p.id));
      split++;
    }
    if (!split) { this.flash('Nothing to split: select a path made of several separate shapes.'); return; }
    this.commit(doc, { selection, nodeSelection: [] });
  }

  /**
   * Combines the selected paths (and rectangles, ellipses, lines) into one
   * compound path. The result takes the topmost shape's style and place in the
   * stacking order; geometry from other groups or transforms is kept in place.
   */
  combinePaths() {
    const { doc } = this.state;
    const sel = new Set(this.state.selection);
    // Document (paint) order, so "topmost" is well defined across groups.
    const members = allShapes(doc.shapes).filter((s) => sel.has(s.id) && s.type !== 'group' && s.type !== 'text');
    if (members.length < 2) { this.flash('Select two or more paths or shapes to combine.'); return; }
    const top = members[members.length - 1];
    const topPath = toPath(top) as PathShape;
    const toTopLocal = invert(mul(parentMatrix(doc, top.id), topPath.transform));
    const subpaths: SubPath[] = [];
    for (const s of members) {
      const p = (s.id === top.id ? topPath : toPath(s)) as PathShape;
      const world = mul(parentMatrix(doc, s.id), p.transform);
      subpaths.push(...mapSubpaths(p.subpaths, mul(toTopLocal, world)));
    }
    const combined: PathShape = { ...topPath, subpaths };
    let next = removeShapes(doc, members.filter((s) => s.id !== top.id).map((s) => s.id));
    next = updateShapes(next, [top.id], () => combined);
    this.commit(next, { selection: [top.id], nodeSelection: [] });
  }

  /** Style update. Fill/stroke changes on groups apply to all descendants. */
  setStyle(patch: Partial<Style>, coalesce?: string) {
    const { selection, doc } = this.state;
    if (!selection.length) {
      const d: Partial<Defaults> = {};
      if (patch.fill !== undefined) d.fill = patch.fill;
      if (patch.stroke !== undefined) d.stroke = patch.stroke;
      if (patch.strokeWidth !== undefined) d.strokeWidth = patch.strokeWidth;
      this.set({ defaults: { ...this.state.defaults, ...d } });
      return;
    }
    const deep = (s: Shape): Shape => {
      if (s.type === 'group') {
        const { opacity, ...rest } = patch;
        return {
          ...s,
          style: opacity !== undefined ? { ...s.style, opacity } : s.style,
          children: Object.keys(rest).length ? s.children.map((c) => deep({ ...c, style: { ...c.style, ...rest } } as Shape)) : s.children,
        };
      }
      return { ...s, style: { ...s.style, ...patch } } as Shape;
    };
    this.commit(updateShapes(doc, selection, deep), {}, coalesce);
  }

  /** Arbitrary per-shape update (geometry fields, text, names, visibility…). */
  updateShape(id: string, fn: (s: Shape) => Shape, coalesce?: string) {
    this.commit(updateShapes(this.state.doc, [id], fn), {}, coalesce);
  }

  setDocument(patch: Partial<Pick<Doc, 'width' | 'height' | 'background'>>, coalesce?: string) {
    this.commit({ ...this.state.doc, ...patch }, {}, coalesce);
  }

  /** Converts shapes in document coordinates into the current scope's local coordinates. */
  private toScope(doc: Doc, shapes: Shape[]): Shape[] {
    const { scope } = this.state;
    if (!scope) return shapes;
    const g = getShape(doc, scope);
    if (!g) return shapes;
    const inv = invert(mul(parentMatrix(doc, scope), g.transform));
    return shapes.map((s) => bake({ ...s, transform: mul(inv, s.transform) } as Shape));
  }

  /** Adds new shapes (given in document coordinates) into the current scope and selects them. */
  addShapes(shapes: Shape[], select = true) {
    const { doc, scope } = this.state;
    const local = this.toScope(doc, shapes);
    this.commit(insertShapes(doc, scope, local), select ? { selection: local.map((s) => s.id) } : {});
  }

  /** Same as addShapes but without a history entry (used while a drawing gesture is in progress). */
  addShapesLive(...shapes: Shape[]) {
    const { doc, scope } = this.state;
    this.live(insertShapes(doc, scope, this.toScope(doc, shapes)));
  }

  // ------------------------------------------------------------ nodes

  /** The single selected path (node tool target). */
  activePath() {
    const [s] = this.selectedShapes();
    return this.state.selection.length === 1 && s?.type === 'path' ? s : null;
  }

  deleteSelectedNodes() {
    const p = this.activePath();
    const { nodeSelection } = this.state;
    if (!p || !nodeSelection.length) return;
    const subpaths = deleteNodes(p.subpaths, new Set(nodeSelection));
    if (!subpaths.length) { this.commit(removeShapes(this.state.doc, [p.id]), { selection: [], nodeSelection: [] }); return; }
    this.commit(updateShapes(this.state.doc, [p.id], (s) => ({ ...s, subpaths }) as Shape), { nodeSelection: [] });
  }

  setSelectedNodeKind(kind: PathNode['kind']) {
    const p = this.activePath();
    if (!p) return;
    let subs = p.subpaths;
    for (const key of this.state.nodeSelection) {
      const [si, ni] = key.split(':').map(Number);
      subs = setNodeKind(subs, si, ni, kind);
    }
    this.commit(updateShapes(this.state.doc, [p.id], (s) => ({ ...s, subpaths: subs }) as Shape));
  }

  nudgeNodes(dx: number, dy: number) {
    const p = this.activePath();
    if (!p) return;
    const inv = invert(parentMatrix(this.state.doc, p.id));
    const d: Vec = [inv[0] * dx + inv[2] * dy, inv[1] * dx + inv[3] * dy];
    const sel = new Set(this.state.nodeSelection);
    const subpaths = p.subpaths.map((s, si) => ({
      ...s,
      nodes: s.nodes.map((n, ni) => {
        if (!sel.has(nodeKey(si, ni))) return n;
        const mv = (v: Vec): Vec => [v[0] + d[0], v[1] + d[1]];
        return { ...n, p: mv(n.p), ...(n.in ? { in: mv(n.in) } : {}), ...(n.out ? { out: mv(n.out) } : {}) };
      }),
    }));
    this.commit(updateShapes(this.state.doc, [p.id], (s) => ({ ...s, subpaths }) as Shape), {}, 'nudge-nodes');
  }

  // ------------------------------------------------------------ clipboard

  copy(): string | null {
    const shapes = this.selectedShapes();
    if (!shapes.length) return null;
    const { doc } = this.state;
    // store in document coordinates so pasting works in any scope
    this.clipboard = shapes.map((s) => ({ ...cloneShape(s, true), transform: mul(parentMatrix(doc, s.id), s.transform) } as Shape));
    return shapesToSvg(this.clipboard, doc.width, doc.height);
  }

  cut(): string | null {
    const svg = this.copy();
    this.deleteSelection();
    return svg;
  }

  hasClipboard() { return this.clipboard.length > 0; }

  paste() {
    if (!this.clipboard.length) return;
    const copies = this.clipboard.map((s) => translateShape(cloneShape(s), [10, 10]));
    this.clipboard = copies.map((s) => cloneShape(s, true));
    this.addShapes(copies);
  }

  /** Pastes SVG markup (e.g. copied from another app) as new shapes. */
  pasteSvg(source: string) {
    const { doc } = importSvg(source);
    if (!doc.shapes.length) return;
    this.addShapes(doc.shapes.map((s) => cloneShape(s)));
  }

  // ------------------------------------------------------------ tools & view

  setTool(tool: ToolId) {
    const patch: Partial<EditorState> = { tool };
    if (tool !== 'node') patch.nodeSelection = [];
    this.set(patch);
    this.setUi({ marquee: null, guides: [], hoverId: null });
  }

  setView(view: View) { this.set({ view }); }
  requestFit() { this.set({ fitRequest: this.state.fitRequest + 1 }); }

  parentOfSelection(): string | null {
    const [id] = this.state.selection;
    return id ? parentIdOf(this.state.doc, id) : null;
  }
}

export const editorStore = new EditorStore();

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(editorStore.subscribe, () => selector(editorStore.getState()));
}
