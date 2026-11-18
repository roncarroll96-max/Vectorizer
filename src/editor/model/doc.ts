import type { Doc, GroupShape, Mat, Shape } from './types';
import { IDENTITY, mul } from './matrix';
import { cloneShape, newId, translateShape } from './shapes';

/** Ancestors (outermost first) followed by the shape itself, or null. */
export function chainTo(shapes: Shape[], id: string): Shape[] | null {
  for (const s of shapes) {
    if (s.id === id) return [s];
    if (s.type === 'group') {
      const c = chainTo(s.children, id);
      if (c) return [s, ...c];
    }
  }
  return null;
}

export function getShape(doc: Doc, id: string): Shape | null {
  const c = chainTo(doc.shapes, id);
  return c ? c[c.length - 1] : null;
}

export function parentIdOf(doc: Doc, id: string): string | null {
  const c = chainTo(doc.shapes, id);
  return c && c.length > 1 ? c[c.length - 2].id : null;
}

/** Combined transform of all ancestors (not including the shape). */
export function parentMatrix(doc: Doc, id: string): Mat {
  const c = chainTo(doc.shapes, id);
  if (!c) return [...IDENTITY];
  return c.slice(0, -1).reduce<Mat>((m, g) => mul(m, g.transform), [...IDENTITY]);
}

export function siblings(doc: Doc, parentId: string | null): Shape[] {
  if (!parentId) return doc.shapes;
  const p = getShape(doc, parentId);
  return p && p.type === 'group' ? p.children : [];
}

/** Immutable update of the shapes with the given ids (untouched branches keep identity). */
export function updateShapes(doc: Doc, ids: Iterable<string>, fn: (s: Shape) => Shape): Doc {
  const set = new Set(ids);
  if (!set.size) return doc;
  const walk = (list: Shape[]): Shape[] => {
    let changed = false;
    const out = list.map((s) => {
      let n = s;
      if (n.type === 'group') {
        const kids = walk(n.children);
        if (kids !== n.children) n = { ...n, children: kids };
      }
      if (set.has(s.id)) n = fn(n);
      if (n !== s) changed = true;
      return n;
    });
    return changed ? out : list;
  };
  const shapes = walk(doc.shapes);
  return shapes === doc.shapes ? doc : { ...doc, shapes };
}

export function replaceShape(doc: Doc, shape: Shape): Doc {
  return updateShapes(doc, [shape.id], () => shape);
}

export function removeShapes(doc: Doc, ids: Iterable<string>): Doc {
  const set = new Set(ids);
  const walk = (list: Shape[]): Shape[] =>
    list.filter((s) => !set.has(s.id)).map((s) => (s.type === 'group' ? { ...s, children: walk(s.children) } : s));
  return { ...doc, shapes: walk(doc.shapes) };
}

/** Inserts shapes into a parent (null = root) at an index (default: on top). */
export function insertShapes(doc: Doc, parentId: string | null, shapes: Shape[], index?: number): Doc {
  const put = (list: Shape[]) => {
    const out = list.slice();
    out.splice(index ?? out.length, 0, ...shapes);
    return out;
  };
  if (!parentId) return { ...doc, shapes: put(doc.shapes) };
  return updateShapes(doc, [parentId], (g) => (g.type === 'group' ? { ...g, children: put(g.children) } : g));
}

function withSiblings(doc: Doc, parentId: string | null, fn: (list: Shape[]) => Shape[]): Doc {
  if (!parentId) return { ...doc, shapes: fn(doc.shapes) };
  return updateShapes(doc, [parentId], (g) => (g.type === 'group' ? { ...g, children: fn(g.children) } : g));
}

export type ReorderOp = 'forward' | 'backward' | 'front' | 'back';

/** Reorders shapes within their own parent. */
export function reorder(doc: Doc, ids: string[], op: ReorderOp): Doc {
  const byParent = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const p = parentIdOf(doc, id);
    if (!byParent.has(p)) byParent.set(p, new Set());
    byParent.get(p)!.add(id);
  }
  let out = doc;
  for (const [parent, set] of byParent) {
    out = withSiblings(out, parent, (list) => {
      const sel = list.filter((s) => set.has(s.id));
      const rest = list.filter((s) => !set.has(s.id));
      if (op === 'front') return [...rest, ...sel];
      if (op === 'back') return [...sel, ...rest];
      const arr = list.slice();
      if (op === 'forward') {
        for (let i = arr.length - 2; i >= 0; i--) {
          if (set.has(arr[i].id) && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      } else {
        for (let i = 1; i < arr.length; i++) {
          if (set.has(arr[i].id) && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
      return arr;
    });
  }
  return out;
}

/** Moves a shape before/after a target (or into a group) — used by layer drag-and-drop. */
export function moveShape(doc: Doc, id: string, targetId: string, where: 'before' | 'after' | 'inside'): Doc {
  if (id === targetId) return doc;
  const chain = chainTo(doc.shapes, targetId);
  if (!chain || chain.some((s) => s.id === id)) return doc; // can't drop into itself
  const shape = getShape(doc, id);
  if (!shape) return doc;
  const fromParent = parentMatrix(doc, id);
  let out = removeShapes(doc, [id]);
  const target = getShape(out, targetId)!;
  const parentId = where === 'inside' ? targetId : parentIdOf(out, targetId);
  const toParent = where === 'inside' ? mul(parentMatrix(out, targetId), target.transform) : parentMatrix(out, targetId);
  // keep the shape visually in place when it changes parent
  const moved = sameMat(fromParent, toParent) ? shape : retarget(shape, fromParent, toParent);
  const list = siblings(out, parentId);
  const idx = where === 'inside' ? list.length : list.findIndex((s) => s.id === targetId) + (where === 'after' ? 1 : 0);
  out = insertShapes(out, parentId, [moved], idx);
  return out;
}

const sameMat = (a: Mat, b: Mat) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

function retarget(s: Shape, from: Mat, to: Mat): Shape {
  // world = from · s.transform  ⇒  new local = to⁻¹ · from · s.transform
  const inv = invertMat(to);
  return { ...s, transform: mul(inv, mul(from, s.transform)) } as Shape;
}

function invertMat(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** Groups sibling shapes (in their stacking order). Returns the new group id. */
export function groupShapes(doc: Doc, ids: string[]): { doc: Doc; groupId: string | null } {
  if (!ids.length) return { doc, groupId: null };
  const parent = parentIdOf(doc, ids[0]);
  const list = siblings(doc, parent);
  const set = new Set(ids.filter((id) => parentIdOf(doc, id) === parent));
  const members = list.filter((s) => set.has(s.id));
  if (!members.length) return { doc, groupId: null };
  const idx = list.findIndex((s) => set.has(s.id));
  const group: GroupShape = {
    id: newId('g'), name: 'Group', type: 'group', transform: [...IDENTITY] as Mat,
    style: { fill: 'none', stroke: 'none', strokeWidth: 1, opacity: 1, fillRule: 'nonzero' }, children: members,
  };
  let out = removeShapes(doc, set);
  out = insertShapes(out, parent, [group], idx);
  return { doc: out, groupId: group.id };
}

/** Dissolves a group, pushing its transform and opacity into the children. */
export function ungroupShape(doc: Doc, id: string): { doc: Doc; childIds: string[] } {
  const g = getShape(doc, id);
  if (!g || g.type !== 'group') return { doc, childIds: [] };
  const parent = parentIdOf(doc, id);
  const idx = siblings(doc, parent).findIndex((s) => s.id === id);
  const kids = g.children.map((c) => ({
    ...c,
    transform: mul(g.transform, c.transform),
    style: { ...c.style, opacity: c.style.opacity * g.style.opacity },
  }) as Shape);
  let out = removeShapes(doc, [id]);
  out = insertShapes(out, parent, kids, idx);
  return { doc: out, childIds: kids.map((k) => k.id) };
}

/** Duplicates shapes next to their originals, offset by `offset` px. */
export function duplicateShapes(doc: Doc, ids: string[], offset = 10): { doc: Doc; newIds: string[] } {
  let out = doc;
  const newIds: string[] = [];
  for (const id of ids) {
    const s = getShape(out, id);
    if (!s) continue;
    const parent = parentIdOf(out, id);
    const list = siblings(out, parent);
    const copy = translateShape(cloneShape(s), [offset, offset], parentMatrix(out, id));
    copy.name = s.name.endsWith(' copy') ? s.name : `${s.name} copy`;
    out = insertShapes(out, parent, [copy], list.findIndex((x) => x.id === id) + 1);
    newIds.push(copy.id);
  }
  return { doc: out, newIds };
}

export function allShapes(shapes: Shape[]): Shape[] {
  return shapes.flatMap((s) => (s.type === 'group' ? [s, ...allShapes(s.children)] : [s]));
}

/** Distinct colors used in the document, most frequent first. */
export function documentColors(doc: Doc): string[] {
  const counts = new Map<string, number>();
  for (const s of allShapes(doc.shapes)) {
    if (s.type === 'group') continue;
    for (const c of [s.style.fill, s.style.stroke]) if (c && c !== 'none') counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
