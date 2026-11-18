import type { Point, Segment } from './types';
import { turnAngle } from './geometry';

/** A cubic Bézier as [p0, c1, c2, p3]. */
export type Cubic = [Point, Point, Point, Point];

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const len = (a: Point) => Math.hypot(a[0], a[1]);
const distSq = (a: Point, b: Point) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function normalize(a: Point): Point {
  const l = len(a);
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}

export function bezierPoint(b: Cubic, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt, c = 3 * mt * mt * t, d = 3 * mt * t * t, e = t * t * t;
  return [
    a * b[0][0] + c * b[1][0] + d * b[2][0] + e * b[3][0],
    a * b[0][1] + c * b[1][1] + d * b[2][1] + e * b[3][1],
  ];
}

/**
 * Philip J. Schneider's least-squares curve fitting ("An Algorithm for
 * Automatically Fitting Digitized Curves", Graphics Gems 1990).
 * Fits a G1-continuous chain of cubics to `points` within `maxError` pixels.
 * `leftTangent` points into the curve from the first point, `rightTangent`
 * points back into the curve from the last point.
 */
export function fitCurve(points: Point[], maxError: number, leftTangent?: Point, rightTangent?: Point): Cubic[] {
  const pts = dedupe(points);
  if (pts.length < 2) return [];
  const n = pts.length;
  const t1 = leftTangent ? normalize(leftTangent) : normalize(sub(pts[1], pts[0]));
  const t2 = rightTangent ? normalize(rightTangent) : normalize(sub(pts[n - 2], pts[n - 1]));
  const out: Cubic[] = [];
  fitCubic(pts, 0, n - 1, t1, t2, Math.max(1e-3, maxError), out, 0);
  return out;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  return out;
}

function fitCubic(pts: Point[], first: number, last: number, t1: Point, t2: Point, error: number, out: Cubic[], depth: number) {
  const nPts = last - first + 1;
  if (nPts === 2 || depth > 32) {
    const d = Math.sqrt(distSq(pts[first], pts[last])) / 3;
    out.push([pts[first], add(pts[first], scale(t1, d)), add(pts[last], scale(t2, d)), pts[last]]);
    return;
  }
  const err2 = error * error;
  let u = chordLengthParameterize(pts, first, last);
  let bez = generateBezier(pts, first, last, u, t1, t2);
  let [maxErr, split] = computeMaxError(pts, first, last, bez, u);
  if (maxErr < err2) { out.push(bez); return; }
  // Close enough: improve the parameterisation (Newton–Raphson) before resorting to a split.
  const iterLimit = Math.max(4 * error, 3, 0.1 * Math.sqrt(distSq(pts[first], pts[last]))) ** 2;
  if (maxErr < iterLimit) {
    for (let i = 0; i < 20; i++) {
      const uPrime = reparameterize(pts, first, u, bez);
      const candidate = generateBezier(pts, first, last, uPrime, t1, t2);
      const [e, sp] = computeMaxError(pts, first, last, candidate, uPrime);
      if (e < err2) { out.push(candidate); return; }
      const stalled = e > maxErr * 0.995;
      if (e < maxErr) { bez = candidate; maxErr = e; split = sp; }
      u = uPrime;
      if (stalled) break;
    }
  }
  split = Math.max(first + 1, Math.min(last - 1, split));
  let center = sub(pts[split - 1], pts[split + 1]);
  if (len(center) === 0) center = sub(pts[split - 1], pts[split]);
  center = normalize(center);
  fitCubic(pts, first, split, t1, center, error, out, depth + 1);
  fitCubic(pts, split, last, scale(center, -1), t2, error, out, depth + 1);
}

function chordLengthParameterize(pts: Point[], first: number, last: number): number[] {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + Math.sqrt(distSq(pts[i], pts[i - 1])));
  const total = u[u.length - 1] || 1;
  return u.map((v) => v / total);
}

function generateBezier(pts: Point[], first: number, last: number, u: number[], t1: Point, t2: Point): Cubic {
  const p0 = pts[first], p3 = pts[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const a0 = scale(t1, b1), a1 = scale(t2, b2);
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const tmp = sub(pts[first + i], add(scale(p0, b0 + b1), scale(p3, b2 + b3)));
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alphaL = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0;
  let alphaR = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  const segLen = Math.sqrt(distSq(p0, p3));
  const eps = 1e-6 * segLen;
  // Degenerate or wildly overshooting handles fall back to the Wu/Barsky heuristic.
  if (alphaL < eps || alphaR < eps || alphaL > segLen * 2 || alphaR > segLen * 2) {
    alphaL = alphaR = segLen / 3;
  }
  return [p0, add(p0, scale(t1, alphaL)), add(p3, scale(t2, alphaR)), p3];
}

function computeMaxError(pts: Point[], first: number, last: number, bez: Cubic, u: number[]): [number, number] {
  let maxDist = 0;
  let split = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const d = distSq(bezierPoint(bez, u[i - first]), pts[i]);
    if (d >= maxDist) { maxDist = d; split = i; }
  }
  return [maxDist, split];
}

function reparameterize(pts: Point[], first: number, u: number[], bez: Cubic): number[] {
  return u.map((t, i) => newtonRaphson(bez, pts[first + i], t));
}

function newtonRaphson(q: Cubic, p: Point, u: number): number {
  const d1: Point[] = [scale(sub(q[1], q[0]), 3), scale(sub(q[2], q[1]), 3), scale(sub(q[3], q[2]), 3)];
  const d2: Point[] = [scale(sub(d1[1], d1[0]), 2), scale(sub(d1[2], d1[1]), 2)];
  const qu = bezierPoint(q, u);
  const mt = 1 - u;
  const q1: Point = add(add(scale(d1[0], mt * mt), scale(d1[1], 2 * mt * u)), scale(d1[2], u * u));
  const q2: Point = add(scale(d2[0], mt), scale(d2[1], u));
  const diff = sub(qu, p);
  const num = dot(diff, q1);
  const den = dot(q1, q1) + dot(diff, q2);
  if (den === 0) return u;
  const r = u - num / den;
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

/** Inserts points so no polygon edge is longer than `maxLen` (keeps the fit honest between vertices). */
export function densify(points: Point[], maxLen = 2.5): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    out.push(p);
    const q = points[i + 1];
    if (!q) break;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const steps = Math.ceil(d / maxLen);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export interface SmoothOptions {
  /** Bézier fitting tolerance in px. 0 disables curves. */
  smoothness: number;
  /** Turning angle (degrees) above which a vertex stays a sharp corner. */
  cornerAngle: number;
}

/** True when both handles sit (almost) on the chord, so a line is enough. */
function isStraight(b: Cubic, tol = 0.12): boolean {
  const [p0, c1, c2, p3] = b;
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const l = Math.hypot(dx, dy);
  if (l === 0) return distSq(c1, p0) < tol * tol && distSq(c2, p0) < tol * tol;
  const off = (c: Point) => Math.abs((c[0] - p0[0]) * dy - (c[1] - p0[1]) * dx) / l;
  const along = (c: Point) => ((c[0] - p0[0]) * dx + (c[1] - p0[1]) * dy) / (l * l);
  const a1 = along(c1), a2 = along(c2);
  return off(c1) < tol && off(c2) < tol && a1 >= -0.01 && a1 <= 1.01 && a2 >= -0.01 && a2 <= 1.01;
}

function pushCubics(segs: Segment[], cubics: Cubic[]) {
  for (const b of cubics) {
    if (isStraight(b)) segs.push({ t: 'L', p: b[3] });
    else segs.push({ t: 'C', c1: b[1], c2: b[2], p: b[3] });
  }
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = sub(b, a), q = sub(d, c);
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/**
 * A sharp pixel corner traced through edge midpoints shows up as a very short
 * edge between two half-turns. When the combined turn exceeds the corner
 * threshold, replace that short edge by the intersection of its neighbours,
 * restoring an exact sharp corner.
 */
export function collapseChamfers(poly: Point[], closed: boolean, cornerAngle: number, maxLen = 1.6): Point[] {
  const n = poly.length;
  if (n < (closed ? 5 : 4)) return poly;
  const at = (i: number) => poly[(i + n) % n];
  const corner = (a: Point, b: Point, c: Point, d: Point): Point | null => {
    if (Math.hypot(c[0] - b[0], c[1] - b[1]) >= maxLen) return null;
    const u = normalize(sub(b, a)), v = normalize(sub(d, c));
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
    if (angle <= cornerAngle) return null;
    const x = lineIntersection(a, b, c, d);
    if (!x || Math.hypot(x[0] - b[0], x[1] - b[1]) >= maxLen || Math.hypot(x[0] - c[0], x[1] - c[1]) >= maxLen) return null;
    return x;
  };
  const out: Point[] = [];
  let firstCollapsed = false;
  let i = 0;
  while (i < n) {
    const last = i === n - 1;
    const allowed = closed ? !(last && firstCollapsed) : i >= 1 && i + 2 < n;
    const x = allowed ? corner(at(i - 1), at(i), at(i + 1), at(i + 2)) : null;
    if (x) {
      if (i === 0) firstCollapsed = true;
      if (last) out.shift(); // the pair (n-1, 0) replaces poly[0] as well
      out.push(x);
      i += 2;
    } else {
      out.push(poly[i]);
      i++;
    }
  }
  return out.length >= (closed ? 3 : 2) ? out : poly;
}

/**
 * Converts a simplified polygon into lines and cubic Béziers.
 * Vertices whose turning angle exceeds `cornerAngle` are corners; each run of
 * points between corners is fitted with Schneider's algorithm. A closed loop
 * with no corners is split at two opposite vertices with smooth tangents.
 */
export function smoothPolygon(input: Point[], closed: boolean, opts: SmoothOptions): { start: Point; segs: Segment[] } {
  const poly = collapseChamfers(input, closed, opts.cornerAngle);
  const n = poly.length;
  if (n === 0) return { start: [0, 0], segs: [] };
  const lines = (pts: Point[]) => {
    const segs: Segment[] = pts.slice(1).map((p) => ({ t: 'L', p }) as Segment);
    if (closed) segs.push({ t: 'L', p: pts[0] });
    return { start: pts[0], segs };
  };
  if (opts.smoothness <= 0 || n < 3) return lines(poly);

  const isCorner = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { isCorner[i] = 1; continue; }
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    if (turnAngle(a, b, c) > opts.cornerAngle) isCorner[i] = 1;
  }
  const tangentAt = (i: number): Point => normalize(sub(poly[(i + 1) % n], poly[(i - 1 + n) % n]));
  const segs: Segment[] = [];
  const fitRun = (run: Point[], t1?: Point, t2?: Point) => {
    if (run.length === 2) { segs.push({ t: 'L', p: run[1] }); return; }
    pushCubics(segs, fitCurve(densify(run), opts.smoothness, t1, t2));
  };

  if (!closed) {
    // Corners split the open polyline into runs.
    let startIdx = 0;
    for (let i = 1; i < n; i++) {
      if (isCorner[i]) { fitRun(poly.slice(startIdx, i + 1)); startIdx = i; }
    }
    return { start: poly[0], segs };
  }

  const corners: number[] = [];
  for (let i = 0; i < n; i++) if (isCorner[i]) corners.push(i);
  const ring = (a: number, b: number) => {
    const out: Point[] = [];
    for (let i = a; ; i = (i + 1) % n) { out.push(poly[i]); if (i === b) break; }
    return out;
  };

  if (corners.length === 0) {
    const m = Math.floor(n / 2);
    const ta = tangentAt(0), tb = tangentAt(m);
    fitRun(ring(0, m), ta, scale(tb, -1));
    fitRun(ring(m, 0), tb, scale(ta, -1));
    return { start: poly[0], segs };
  }
  if (corners.length === 1) {
    const c = corners[0];
    const m = (c + Math.floor(n / 2)) % n;
    const tm = tangentAt(m);
    fitRun(ring(c, m), undefined, scale(tm, -1));
    fitRun(ring(m, c), tm, undefined);
    return { start: poly[c], segs };
  }
  for (let k = 0; k < corners.length; k++) {
    fitRun(ring(corners[k], corners[(k + 1) % corners.length]));
  }
  return { start: poly[corners[0]], segs };
}
