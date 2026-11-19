import type { Box, Mat, NodeKind, PathNode, SubPath, Vec } from './types';
import { apply } from './matrix';
import { loopsToPathData } from '../../core/svg';
import { groupShapes } from '../../core/shapes';
import type { PathLoop, Segment } from '../../core/types';

const near = (a: Vec, b: Vec, eps = 1e-6) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const len = (a: Vec) => Math.hypot(a[0], a[1]);

// ---------------------------------------------------------------- parsing

class Scanner {
  i = 0;
  constructor(private s: string) {}
  private static NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  skip() {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }
  done() { this.skip(); return this.i >= this.s.length; }
  peekCommand(): string | null {
    this.skip();
    const c = this.s[this.i];
    return c && /[a-zA-Z]/.test(c) ? c : null;
  }
  take() { return this.s[this.i++]; }
  num(): number {
    this.skip();
    Scanner.NUM.lastIndex = this.i;
    const m = Scanner.NUM.exec(this.s);
    if (!m) throw new Error(`Expected a number at position ${this.i}`);
    this.i = Scanner.NUM.lastIndex;
    return Number(m[0]);
  }
  flag(): boolean {
    this.skip();
    const c = this.s[this.i];
    if (c !== '0' && c !== '1') throw new Error(`Expected an arc flag at position ${this.i}`);
    this.i++;
    return c === '1';
  }
}

/** Converts an SVG elliptical arc into cubic Bézier segments [c1, c2, end]. Returns null for a straight line. */
export function arcToCubics(p0: Vec, rxIn: number, ryIn: number, phiDeg: number, large: boolean, sweep: boolean, p1: Vec): [Vec, Vec, Vec][] | null {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || near(p0, p1)) return null;
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry, cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const angle = (u: Vec, v: Vec) => {
    const d = (u[0] * v[0] + u[1] * v[1]) / (len(u) * len(v));
    const a = Math.acos(Math.max(-1, Math.min(1, d)));
    return u[0] * v[1] - u[1] * v[0] < 0 ? -a : a;
  };
  const theta1 = angle([1, 0], [(x1p - cxp) / rx, (y1p - cyp) / ry]);
  let dtheta = angle([(x1p - cxp) / rx, (y1p - cyp) / ry], [(-x1p - cxp) / rx, (-y1p - cyp) / ry]);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2) - 1e-9));
  const delta = dtheta / segs;
  const k = (4 / 3) * Math.tan(delta / 4);
  const map = (u: Vec): Vec => [cx + rx * u[0] * cos - ry * u[1] * sin, cy + rx * u[0] * sin + ry * u[1] * cos];
  const out: [Vec, Vec, Vec][] = [];
  for (let i = 0; i < segs; i++) {
    const t1 = theta1 + i * delta, t2 = t1 + delta;
    const c1 = map([Math.cos(t1) - k * Math.sin(t1), Math.sin(t1) + k * Math.cos(t1)]);
    const c2 = map([Math.cos(t2) + k * Math.sin(t2), Math.sin(t2) - k * Math.cos(t2)]);
    const end = i === segs - 1 ? p1 : map([Math.cos(t2), Math.sin(t2)]);
    out.push([c1, c2, end]);
  }
  return out;
}

/** Parses SVG path data (all commands, absolute and relative) into editable subpaths. */
export function parsePathData(d: string): SubPath[] {
  const sc = new Scanner(d);
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let pos: Vec = [0, 0], start: Vec = [0, 0];
  let lastCubic: Vec | null = null, lastQuad: Vec | null = null;
  let cmd = '';
  const ensure = () => {
    if (!cur) { cur = { nodes: [{ p: pos, kind: 'corner' }], closed: false }; subs.push(cur); start = pos; }
    return cur;
  };
  const lineTo = (p: Vec) => { ensure().nodes.push({ p, kind: 'corner' }); pos = p; };
  const cubicTo = (c1: Vec, c2: Vec, p: Vec) => {
    const s = ensure();
    const last = s.nodes[s.nodes.length - 1];
    if (!(near(c1, last.p) && near(c2, p))) {
      if (!near(c1, last.p)) last.out = c1;
      s.nodes.push({ p, in: near(c2, p) ? undefined : c2, kind: 'corner' });
    } else {
      s.nodes.push({ p, kind: 'corner' });
    }
    pos = p;
  };
  while (!sc.done()) {
    const c = sc.peekCommand();
    if (c) { sc.take(); cmd = c; } else if (!cmd) throw new Error('Path data must start with a command');
    const rel = cmd === cmd.toLowerCase();
    const R = (x: number, y: number): Vec => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    const up = cmd.toUpperCase();
    if (up !== 'C' && up !== 'S') lastCubic = null;
    if (up !== 'Q' && up !== 'T') lastQuad = null;
    switch (up) {
      case 'M': {
        const p = R(sc.num(), sc.num());
        cur = { nodes: [{ p, kind: 'corner' }], closed: false };
        subs.push(cur);
        pos = start = p;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': lineTo(R(sc.num(), sc.num())); break;
      case 'H': { const x = sc.num(); lineTo([rel ? pos[0] + x : x, pos[1]]); break; }
      case 'V': { const y = sc.num(); lineTo([pos[0], rel ? pos[1] + y : y]); break; }
      case 'C': {
        const c1 = R(sc.num(), sc.num()), c2 = R(sc.num(), sc.num()), p = R(sc.num(), sc.num());
        cubicTo(c1, c2, p);
        lastCubic = c2;
        break;
      }
      case 'S': {
        const c1: Vec = lastCubic ? [2 * pos[0] - lastCubic[0], 2 * pos[1] - lastCubic[1]] : pos;
        const c2 = R(sc.num(), sc.num()), p = R(sc.num(), sc.num());
        cubicTo(c1, c2, p);
        lastCubic = c2;
        break;
      }
      case 'Q': case 'T': {
        const q: Vec = up === 'Q' ? R(sc.num(), sc.num()) : lastQuad ? [2 * pos[0] - lastQuad[0], 2 * pos[1] - lastQuad[1]] : pos;
        const p = R(sc.num(), sc.num());
        cubicTo(lerp(pos, q, 2 / 3), lerp(p, q, 2 / 3), p);
        lastQuad = q;
        break;
      }
      case 'A': {
        const rx = sc.num(), ry = sc.num(), phi = sc.num(), large = sc.flag(), sweep = sc.flag();
        const p = R(sc.num(), sc.num());
        const cubics = arcToCubics(pos, rx, ry, phi, large, sweep, p);
        if (!cubics) lineTo(p);
        else for (const [c1, c2, e] of cubics) cubicTo(c1, c2, e);
        break;
      }
      case 'Z': {
        if (cur) {
          const s: SubPath = cur;
          s.closed = true;
          const n = s.nodes.length;
          if (n > 1 && near(s.nodes[n - 1].p, s.nodes[0].p, 1e-4)) {
            const last = s.nodes.pop()!;
            if (last.in) s.nodes[0].in = last.in;
          }
        }
        cur = null;
        pos = start;
        break;
      }
      default: throw new Error(`Unsupported path command "${cmd}"`);
    }
  }
  for (const s of subs) classifyNodes(s);
  return subs.filter((s) => s.nodes.length > 0);
}

/** Marks nodes whose handles are collinear as smooth (or symmetric if equal length). */
export function classifyNodes(s: SubPath): void {
  for (const n of s.nodes) {
    if (!n.in || !n.out) { n.kind = 'corner'; continue; }
    const a = sub(n.in, n.p), b = sub(n.out, n.p);
    const la = len(a), lb = len(b);
    if (la < 1e-6 || lb < 1e-6) { n.kind = 'corner'; continue; }
    const cross = (a[0] * b[1] - a[1] * b[0]) / (la * lb);
    const dot = a[0] * b[0] + a[1] * b[1];
    if (Math.abs(cross) < 0.02 && dot < 0) n.kind = Math.abs(la - lb) < 1e-3 * Math.max(la, lb) + 1e-6 ? 'symmetric' : 'smooth';
    else n.kind = 'corner';
  }
}

// ---------------------------------------------------------------- serialising

export function subpathsToLoops(subs: SubPath[]): PathLoop[] {
  return subs.filter((s) => s.nodes.length > 1).map((s) => {
    const segs: Segment[] = [];
    const n = s.nodes.length;
    const count = s.closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      const a = s.nodes[i], b = s.nodes[(i + 1) % n];
      if (a.out || b.in) segs.push({ t: 'C', c1: a.out ?? a.p, c2: b.in ?? b.p, p: b.p });
      else segs.push({ t: 'L', p: b.p });
    }
    return { start: s.nodes[0].p, segs, closed: s.closed };
  });
}

export function serializePath(subs: SubPath[], precision: 1 | 2 = 2): string {
  return loopsToPathData(subpathsToLoops(subs), precision);
}

// ---------------------------------------------------------------- geometry

export function mapSubpaths(subs: SubPath[], m: Mat): SubPath[] {
  return subs.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((n) => ({
      kind: n.kind,
      p: apply(m, n.p),
      ...(n.in ? { in: apply(m, n.in) } : {}),
      ...(n.out ? { out: apply(m, n.out) } : {}),
    })),
  }));
}

export interface Seg { a: PathNode; b: PathNode; cubic: [Vec, Vec, Vec, Vec] | null }

export function segmentsOf(s: SubPath): Seg[] {
  const n = s.nodes.length;
  const out: Seg[] = [];
  const count = s.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = s.nodes[i], b = s.nodes[(i + 1) % n];
    out.push({ a, b, cubic: a.out || b.in ? [a.p, a.out ?? a.p, b.in ?? b.p, b.p] : null });
  }
  return out;
}

/** A polygon approximating a subpath (curves sampled), for containment tests. */
export function flattenSubpath(s: SubPath, steps = 8): Vec[] {
  const out: Vec[] = [];
  if (s.nodes.length) out.push(s.nodes[0].p);
  for (const seg of segmentsOf(s)) {
    if (seg.cubic) for (let k = 1; k <= steps; k++) out.push(cubicAt(seg.cubic, k / steps));
    else out.push(seg.b.p);
  }
  if (s.closed && out.length > 1) out.pop(); // the last point repeats the first
  return out;
}

/**
 * Splits compound path data into its separate shapes: each outer boundary with
 * the holes inside it (per the fill rule). Open subpaths stand alone. Returns
 * the subpaths unchanged, regrouped, in their original order.
 */
export function splitSubpaths(subs: SubPath[], fillRule: 'nonzero' | 'evenodd'): SubPath[][] {
  const groups = groupShapes(subs.map((s) => flattenSubpath(s)), { closed: subs.map((s) => s.closed), fillRule });
  return groups.map((g) => g.slice().sort((a, b) => a - b).map((i) => subs[i]));
}

export function cubicAt(c: [Vec, Vec, Vec, Vec], t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, cc = 3 * mt * t * t, d = t * t * t;
  return [a * c[0][0] + b * c[1][0] + cc * c[2][0] + d * c[3][0], a * c[0][1] + b * c[1][1] + cc * c[2][1] + d * c[3][1]];
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** Exact bounds of subpaths (optionally transformed first, which keeps them tight). */
export function subpathBounds(subs: SubPath[], m?: Mat): Box | null {
  const src = m ? mapSubpaths(subs, m) : subs;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const addP = (p: Vec) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const s of src) {
    for (const n of s.nodes) addP(n.p);
    for (const seg of segmentsOf(s)) {
      if (!seg.cubic) continue;
      const c = seg.cubic;
      for (const t of [...cubicExtrema(c[0][0], c[1][0], c[2][0], c[3][0]), ...cubicExtrema(c[0][1], c[1][1], c[2][1], c[3][1])]) addP(cubicAt(c, t));
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface NearestHit { si: number; seg: number; t: number; dist: number; point: Vec }

/** Closest point on any segment to `pt` (sampling + local refinement). */
export function nearestOnPath(subs: SubPath[], pt: Vec): NearestHit | null {
  let best: NearestHit | null = null;
  subs.forEach((s, si) => {
    segmentsOf(s).forEach((seg, k) => {
      const at = (t: number): Vec => (seg.cubic ? cubicAt(seg.cubic, t) : lerp(seg.a.p, seg.b.p, t));
      if (!seg.cubic) {
        const d = sub(seg.b.p, seg.a.p);
        const l2 = d[0] * d[0] + d[1] * d[1];
        const t = l2 ? Math.max(0, Math.min(1, ((pt[0] - seg.a.p[0]) * d[0] + (pt[1] - seg.a.p[1]) * d[1]) / l2)) : 0;
        const q = at(t), dist = len(sub(q, pt));
        if (!best || dist < best.dist) best = { si, seg: k, t, dist, point: q };
        return;
      }
      let bt = 0, bd = Infinity;
      for (let i = 0; i <= 32; i++) {
        const t = i / 32, dd = len(sub(at(t), pt));
        if (dd < bd) { bd = dd; bt = t; }
      }
      let step = 1 / 64;
      for (let it = 0; it < 12; it++) {
        for (const t of [bt - step, bt + step]) {
          if (t < 0 || t > 1) continue;
          const dd = len(sub(at(t), pt));
          if (dd < bd) { bd = dd; bt = t; }
        }
        step /= 2;
      }
      if (!best || bd < best.dist) best = { si, seg: k, t: bt, dist: bd, point: at(bt) };
    });
  });
  return best;
}

// ---------------------------------------------------------------- editing

const cloneNode = (n: PathNode): PathNode => ({ p: [...n.p] as Vec, kind: n.kind, ...(n.in ? { in: [...n.in] as Vec } : {}), ...(n.out ? { out: [...n.out] as Vec } : {}) });
export const cloneSubpaths = (subs: SubPath[]): SubPath[] => subs.map((s) => ({ closed: s.closed, nodes: s.nodes.map(cloneNode) }));

/** Inserts a node at parameter t of segment `segIndex` without changing the shape. */
export function splitSegment(subs: SubPath[], si: number, segIndex: number, t: number): SubPath[] {
  const out = cloneSubpaths(subs);
  const s = out[si];
  const n = s.nodes.length;
  const a = s.nodes[segIndex], b = s.nodes[(segIndex + 1) % n];
  let node: PathNode;
  if (a.out || b.in) {
    const p0 = a.p, c1 = a.out ?? a.p, c2 = b.in ?? b.p, p3 = b.p;
    const q0 = lerp(p0, c1, t), q1 = lerp(c1, c2, t), q2 = lerp(c2, p3, t);
    const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t);
    const m = lerp(r0, r1, t);
    a.out = q0;
    b.in = q2;
    node = { p: m, in: r0, out: r1, kind: 'smooth' };
  } else {
    node = { p: lerp(a.p, b.p, t), kind: 'corner' };
  }
  s.nodes.splice(segIndex + 1, 0, node);
  return out;
}

export const nodeKey = (si: number, ni: number) => `${si}:${ni}`;

/** Removes the given nodes; subpaths left with fewer than two nodes disappear. */
export function deleteNodes(subs: SubPath[], keys: Set<string>): SubPath[] {
  return cloneSubpaths(subs)
    .map((s, si) => ({ ...s, nodes: s.nodes.filter((_, ni) => !keys.has(nodeKey(si, ni))) }))
    .filter((s) => s.nodes.length >= 2);
}

/** Changes a node's type, creating or aligning handles as needed. */
export function setNodeKind(subs: SubPath[], si: number, ni: number, kind: NodeKind): SubPath[] {
  const out = cloneSubpaths(subs);
  const s = out[si];
  const n = s.nodes[ni];
  n.kind = kind;
  if (kind === 'corner') return out;
  const count = s.nodes.length;
  const prev = ni > 0 ? s.nodes[ni - 1] : s.closed ? s.nodes[count - 1] : null;
  const next = ni < count - 1 ? s.nodes[ni + 1] : s.closed ? s.nodes[0] : null;
  let dir: Vec;
  if (n.in && n.out) dir = sub(n.out, n.in);
  else if (prev && next) dir = sub(next.p, prev.p);
  else if (next) dir = sub(next.p, n.p);
  else if (prev) dir = sub(n.p, prev.p);
  else return out;
  const l = len(dir) || 1;
  dir = [dir[0] / l, dir[1] / l];
  let li = n.in ? len(sub(n.in, n.p)) : prev ? len(sub(n.p, prev.p)) / 3 : 0;
  let lo = n.out ? len(sub(n.out, n.p)) : next ? len(sub(next.p, n.p)) / 3 : 0;
  if (kind === 'symmetric') li = lo = (li + lo) / 2 || Math.max(li, lo);
  if (prev || n.in) n.in = [n.p[0] - dir[0] * li, n.p[1] - dir[1] * li];
  if (next || n.out) n.out = [n.p[0] + dir[0] * lo, n.p[1] + dir[1] * lo];
  return out;
}

/** Moves one handle, keeping the opposite handle aligned for smooth/symmetric nodes. */
export function moveHandle(node: PathNode, which: 'in' | 'out', to: Vec): PathNode {
  const n = cloneNode(node);
  n[which] = to;
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  if (n.kind !== 'corner' && o) {
    const v = sub(to, n.p);
    const l = len(v);
    if (l > 1e-9) {
      const ol = n.kind === 'symmetric' ? l : len(sub(o, n.p));
      n[other] = [n.p[0] - (v[0] / l) * ol, n.p[1] - (v[1] / l) * ol];
    }
  }
  return n;
}

export function translateNode(node: PathNode, d: Vec): PathNode {
  const n = cloneNode(node);
  const add = (p: Vec): Vec => [p[0] + d[0], p[1] + d[1]];
  n.p = add(n.p);
  if (n.in) n.in = add(n.in);
  if (n.out) n.out = add(n.out);
  return n;
}

// ---------------------------------------------------------------- primitives

const K = 0.5522847498;

export function ellipseSubpath(cx: number, cy: number, rx: number, ry: number): SubPath {
  const kx = rx * K, ky = ry * K;
  return {
    closed: true,
    nodes: [
      { p: [cx + rx, cy], in: [cx + rx, cy - ky], out: [cx + rx, cy + ky], kind: 'symmetric' },
      { p: [cx, cy + ry], in: [cx + kx, cy + ry], out: [cx - kx, cy + ry], kind: 'symmetric' },
      { p: [cx - rx, cy], in: [cx - rx, cy + ky], out: [cx - rx, cy - ky], kind: 'symmetric' },
      { p: [cx, cy - ry], in: [cx - kx, cy - ry], out: [cx + kx, cy - ry], kind: 'symmetric' },
    ],
  };
}

export function rectSubpath(x: number, y: number, w: number, h: number, rxIn = 0): SubPath {
  const r = Math.max(0, Math.min(rxIn, w / 2, h / 2));
  if (r === 0) {
    return { closed: true, nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => ({ p: p as Vec, kind: 'corner' as const })) };
  }
  const k = r * K;
  return {
    closed: true,
    nodes: [
      { p: [x + r, y], in: [x + r - k, y], kind: 'corner' },
      { p: [x + w - r, y], out: [x + w - r + k, y], kind: 'corner' },
      { p: [x + w, y + r], in: [x + w, y + r - k], kind: 'corner' },
      { p: [x + w, y + h - r], out: [x + w, y + h - r + k], kind: 'corner' },
      { p: [x + w - r, y + h], in: [x + w - r + k, y + h], kind: 'corner' },
      { p: [x + r, y + h], out: [x + r - k, y + h], kind: 'corner' },
      { p: [x, y + h - r], in: [x, y + h - r + k], kind: 'corner' },
      { p: [x, y + r], out: [x, y + r - k], kind: 'corner' },
    ],
  };
}

export function regularPolygon(cx: number, cy: number, r: number, sides: number, rotationDeg = -90): SubPath {
  const n = Math.max(3, Math.round(sides));
  const nodes: PathNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rotationDeg + (360 * i) / n) * Math.PI) / 180;
    nodes.push({ p: [cx + r * Math.cos(a), cy + r * Math.sin(a)], kind: 'corner' });
  }
  return { closed: true, nodes };
}
